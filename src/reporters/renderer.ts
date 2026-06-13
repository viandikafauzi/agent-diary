import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AnalysisResult, Session, SourceMetrics } from '../types.js';

interface SerializedMessage {
  role: string;
  content: string;
  tool: string | null;
  toolInput: string | null;
  tool_result_attr: string | null;
  finish_reason: string | null;
  ts: string;
}

interface SerializedSession {
  source: string;
  model: string | null;
  title: string | null;
  started: string;
  messages: SerializedMessage[];
  tokensInput: number;
  tokensOutput: number;
  totalTokens: number;
  estimatedCostUsd: number;
  duration: string;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function thousands(n: number): string {
  return n.toLocaleString('en-US');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function pct(value: number): string {
  return (value * 100).toFixed(0);
}

function fmt2(value: number): string {
  return value.toFixed(2);
}

function fmtDollars(value: number): string {
  if (value === 0) return '$0.00';
  if (value < 0.01) return '<$0.01';
  return '$' + value.toFixed(2);
}

function polarityClass(polarity: string): string {
  if (polarity === 'positive') return 'positive';
  if (polarity === 'negative') return 'negative';
  return 'neutral';
}

function effectivenessClass(label: string): string {
  if (label === 'effective') return 'positive';
  if (label === 'struggling') return 'negative';
  return 'neutral';
}

function toneScorePillClass(score: number): string {
  if (score >= 0.05) return 'good';
  if (score <= -0.05) return 'bad';
  return 'ok';
}

function sourceBadgeClass(source: string): string {
  const known = ['hermes', 'pi', 'opencode', 'claude', 'codex'];
  return known.includes(source) ? source : '';
}

function formatDurationMs(ms: number): string {
  if (ms <= 0) return '--';
  const totalMinutes = ms / 60000;
  if (totalMinutes < 1) return '< 1 min';
  const hrs = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  if (hrs > 0) return `${hrs} hr ${mins} min`;
  return `${mins} min`;
}

function formatDurationShort(ms: number): string {
  if (ms <= 0) return '--';
  const totalMinutes = ms / 60000;
  if (totalMinutes < 1) return '<1m';
  const hrs = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

// ---------------------------------------------------------------------------
// Tool input formatting
// ---------------------------------------------------------------------------

function formatToolInput(tc: Record<string, unknown>): string | null {
  let input: Record<string, unknown> | undefined;

  if (tc.input && typeof tc.input === 'object') {
    input = tc.input as Record<string, unknown>;
  } else if (tc.arguments && typeof tc.arguments === 'object') {
    input = tc.arguments as Record<string, unknown>;
  } else if (tc.function && typeof tc.function === 'object') {
    const fn = tc.function as Record<string, unknown>;
    if (typeof fn.arguments === 'string') {
      try {
        input = JSON.parse(fn.arguments);
      } catch {
        return fn.arguments as string;
      }
    } else if (fn.arguments && typeof fn.arguments === 'object') {
      input = fn.arguments as Record<string, unknown>;
    }
  }

  if (!input) return null;

  let toolName = '';
  if (typeof tc.name === 'string') toolName = tc.name;
  else if (tc.function && typeof tc.function === 'object' && typeof (tc.function as Record<string, unknown>).name === 'string') toolName = (tc.function as Record<string, unknown>).name as string;

  const name = toolName.toLowerCase();

  if (name === 'bash' || name === 'execute' || name === 'execute_command') {
    const cmd = input.command ?? input.cmd ?? input.script;
    if (typeof cmd === 'string') return cmd;
  }

  if (name === 'read' || name === 'read_file') {
    const filePath = input.path ?? input.file_path ?? input.filePath;
    if (typeof filePath === 'string') return filePath;
  }

  if (name === 'write' || name === 'create_file' || name === 'write_file') {
    const filePath = input.path ?? input.file_path ?? input.filePath;
    if (typeof filePath === 'string') return filePath;
  }

  if (name === 'edit' || name === 'replace' || name === 'edit_file') {
    const filePath = input.path ?? input.file_path ?? input.filePath ?? input.filename;
    if (typeof filePath === 'string') return filePath;
  }

  if (name === 'search' || name === 'grep' || name === 'find') {
    const query = input.query ?? input.pattern ?? input.search;
    if (typeof query === 'string') return query;
  }

  const keys = Object.keys(input);
  if (keys.length === 0) return null;

  for (const key of ['command', 'cmd', 'path', 'query', 'text', 'content', 'url', 'name', 'id']) {
    if (input[key] !== undefined) {
      const val = input[key];
      if (typeof val === 'string') return val.length > 200 ? val.slice(0, 200) + '...' : val;
      return String(val);
    }
  }

  const json = JSON.stringify(input);
  return json.length > 200 ? json.slice(0, 200) + '...' : json;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function serializeSession(sess: Session): SerializedSession {
  const started = sess.startedAt ? sess.startedAt.toISOString() : '';
  const messages: SerializedMessage[] = sess.messages.map((msg) => {
    const toolNames = msg.toolCalls
      .map((tc) => {
        if (typeof tc.name === 'string') return tc.name;
        if (tc.function && typeof tc.function === 'object' && typeof (tc.function as Record<string, unknown>).name === 'string') return (tc.function as Record<string, unknown>).name as string;
        if (typeof tc.function === 'string') return tc.function;
        return '';
      })
      .filter(Boolean);
    const tool = msg.toolName ?? (toolNames.length > 0 ? toolNames.join(', ') : null);

    let toolInput: string | null = null;
    if (msg.toolCalls.length > 0) {
      toolInput = formatToolInput(msg.toolCalls[0]);
    }

    return {
      role: msg.role,
      content: msg.content,
      tool,
      toolInput,
      tool_result_attr: null,
      finish_reason: msg.finishReason,
      ts: msg.timestamp ? msg.timestamp.toISOString() : '',
    };
  });

  let durationMs = 0;
  if (sess.startedAt && sess.endedAt) {
    durationMs = sess.endedAt.getTime() - sess.startedAt.getTime();
  }

  return {
    source: sess.source,
    model: sess.model,
    title: sess.title ?? null,
    started,
    messages,
    tokensInput: sess.tokensInput,
    tokensOutput: sess.tokensOutput,
    totalTokens: sess.totalTokens,
    estimatedCostUsd: sess.estimatedCostUsd,
    duration: formatDurationShort(durationMs),
  };
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

function loadCSS(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const templatePath = path.resolve(__dirname, '../../templates/report.html');
  const templateContent = fs.readFileSync(templatePath, 'utf-8');
  const styleMatch = templateContent.match(/<style>([\s\S]*?)<\/style>/);
  return styleMatch ? styleMatch[1].trim() : '';
}

// ---------------------------------------------------------------------------
// Source filter data for JS-driven card swapping
// ---------------------------------------------------------------------------

function buildSourceFilterData(
  result: AnalysisResult,
  sessions: Session[],
  sources: string[],
): Record<string, unknown> {
  const { sentiment, tone, interaction, effectiveness, perSourceAnalysis } = result;
  const data: Record<string, unknown> = {};

  const totalSessions = sessions.length;
  const totalMessages = tone.totalAgentMessages + totalSessions;
  const totalTokens = sessions.reduce((sum, s) => sum + s.totalTokens, 0);
  const totalCost = sessions.reduce((sum, s) => sum + s.estimatedCostUsd, 0);
  const totalDurationMs = sessions.reduce((sum, s) => {
    if (s.startedAt && s.endedAt) return sum + (s.endedAt.getTime() - s.startedAt.getTime());
    return sum;
  }, 0);

  const polarityTotal = sentiment.polarityDistribution.positive + sentiment.polarityDistribution.neutral + sentiment.polarityDistribution.negative;

  data['all'] = {
    cards: {
      'sessions-count': { value: thousands(totalSessions), subtext: thousands(totalMessages) + ' messages' },
      'cost': { value: fmtDollars(totalCost), subtext: totalCost > 0 ? 'estimated total cost' : 'no cost data', cls: '' },
      'tokens': { value: thousands(totalTokens), subtext: 'total tokens used', cls: '' },
      'duration': { value: formatDurationMs(totalDurationMs), subtext: 'total session time', cls: '' },
    },
    agentBehavior: {
      'helpfulness': { value: pct(tone.helpfulnessRate) + '%', detail: thousands(tone.helpfulnessCount) + ' helpful markers' },
      'self-correction': { value: pct(tone.selfCorrectionRate) + '%', detail: thousands(tone.selfCorrectionCount) + ' backtrack markers' },
      'agent-questions': { value: pct(tone.questionRate) + '%', detail: thousands(tone.questionCount) + ' clarification questions asked' },
      'confidence': { value: fmt2(tone.confidenceNet), detail: thousands(tone.confidenceCount) + ' confident vs ' + thousands(tone.uncertaintyCount) + ' uncertain markers' },
      'correction-rate': { value: pct(interaction.correctionRatio) + '%', detail: thousands(interaction.totalCorrections) + ' corrections / ' + thousands(interaction.totalTurns) + ' turns' },
      'clarification-rate': { value: pct(interaction.clarificationRatio) + '%', detail: thousands(interaction.totalClarifications) + ' clarifications / ' + thousands(interaction.totalTurns) + ' turns' },
    },
  };

  for (const src of sources) {
    const srcAnalysis = perSourceAnalysis[src];
    if (!srcAnalysis) continue;

    const srcSessions = sessions.filter(s => s.source === src);
    const srcSentiment = srcAnalysis.sentiment;
    const srcTone = srcAnalysis.tone;
    const srcInteraction = srcAnalysis.interaction;
    const srcEffectiveness = srcAnalysis.effectiveness;
    const srcTotalMsgs = srcTone.totalAgentMessages + srcSessions.length;
    const srcTotalTokens = srcSessions.reduce((sum, s) => sum + s.totalTokens, 0);
    const srcTotalCost = srcSessions.reduce((sum, s) => sum + s.estimatedCostUsd, 0);
    const srcDurationMs = srcSessions.reduce((sum, s) => {
      if (s.startedAt && s.endedAt) return sum + (s.endedAt.getTime() - s.startedAt.getTime());
      return sum;
    }, 0);

    data[src] = {
      cards: {
        'sessions-count': { value: thousands(srcSessions.length), subtext: thousands(srcTotalMsgs) + ' messages' },
        'cost': { value: fmtDollars(srcTotalCost), subtext: srcTotalCost > 0 ? 'estimated cost' : 'no cost data', cls: '' },
        'tokens': { value: thousands(srcTotalTokens), subtext: 'total tokens used', cls: '' },
        'duration': { value: formatDurationMs(srcDurationMs), subtext: 'total session time', cls: '' },
      },
      agentBehavior: {
        'helpfulness': { value: pct(srcTone.helpfulnessRate) + '%', detail: thousands(srcTone.helpfulnessCount) + ' helpful markers' },
        'self-correction': { value: pct(srcTone.selfCorrectionRate) + '%', detail: thousands(srcTone.selfCorrectionCount) + ' backtrack markers' },
        'agent-questions': { value: pct(srcTone.questionRate) + '%', detail: thousands(srcTone.questionCount) + ' clarification questions asked' },
        'confidence': { value: fmt2(srcTone.confidenceNet), detail: thousands(srcTone.confidenceCount) + ' confident vs ' + thousands(srcTone.uncertaintyCount) + ' uncertain markers' },
        'correction-rate': { value: pct(srcInteraction.correctionRatio) + '%', detail: thousands(srcInteraction.totalCorrections) + ' corrections / ' + thousands(srcInteraction.totalTurns) + ' turns' },
        'clarification-rate': { value: pct(srcInteraction.clarificationRatio) + '%', detail: thousands(srcInteraction.totalClarifications) + ' clarifications / ' + thousands(srcInteraction.totalTurns) + ' turns' },
      },
    };
  }

  return data;
}

// ---------------------------------------------------------------------------
// Session anomalies
// ---------------------------------------------------------------------------

interface AnomalyInfo {
  session: Session;
  durationMinutes: number | null;
  cost: number;
  toolCallCount: number;
  correctionRate: number;
  exceeded: string[];
}

function computeAnomalies(sessions: Session[], interaction: { totalCorrections: number; correctionRatio: number }): AnomalyInfo[] {
  if (sessions.length < 2) return [];

  // Compute per-session metrics
  const metrics: Array<{
    session: Session;
    durationMinutes: number | null;
    cost: number;
    toolCallCount: number;
    correctionRate: number;
  }> = [];

  for (const sess of sessions) {
    let durationMinutes: number | null = null;
    if (sess.startedAt && sess.endedAt) {
      durationMinutes = (sess.endedAt.getTime() - sess.startedAt.getTime()) / 60000;
    }

    // Estimate per-session correction rate from user messages
    let userMsgCount = 0;
    let correctionHits = 0;
    for (const msg of sess.messages) {
      if (msg.role !== 'user' || msg.content.length === 0) continue;
      userMsgCount++;
      const lower = msg.content.toLowerCase();
      // Simple heuristic: messages starting with or strongly indicating correction
      if (
        lower.startsWith('no ') || lower.startsWith('wrong') || lower.startsWith('fix') ||
        lower.startsWith('correct ') || lower.startsWith('actually ') || lower.startsWith('instead') ||
        lower.startsWith('that\'s not') || lower.startsWith('you\'re wrong') ||
        lower.includes(' don\'t want') || lower.includes('meant ') || lower.includes('change that')
      ) {
        correctionHits++;
      }
    }
    const correctionRate = userMsgCount > 0 ? correctionHits / userMsgCount : 0;

    metrics.push({
      session: sess,
      durationMinutes,
      cost: sess.estimatedCostUsd,
      toolCallCount: sess.toolCallCount,
      correctionRate,
    });
  }

  // Compute means
  const durationVals = metrics.map(m => m.durationMinutes).filter((d): d is number => d !== null);
  const costVals = metrics.map(m => m.cost).filter(c => c > 0);
  const toolVals = metrics.map(m => m.toolCallCount);
  const corrVals = metrics.map(m => m.correctionRate);

  const mean = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const stddev = (arr: number[], avg: number) => {
    if (arr.length < 2) return 0;
    const variance = arr.reduce((sum, v) => sum + ((v - avg) ** 2), 0) / arr.length;
    return Math.sqrt(variance);
  };

  const durationMean = mean(durationVals);
  const durationStd = stddev(durationVals, durationMean);
  const costMean = mean(costVals);
  const costStd = stddev(costVals, costMean);
  const toolMean = mean(toolVals);
  const toolStd = stddev(toolVals, toolMean);
  const corrMean = mean(corrVals);
  const corrStd = stddev(corrVals, corrMean);

  const anomalies: AnomalyInfo[] = [];

  for (const m of metrics) {
    const exceeded: string[] = [];

    // Duration: > 2*stddev OR > 30 min
    if (m.durationMinutes !== null) {
      if (durationStd > 0 && m.durationMinutes > durationMean + 2 * durationStd) exceeded.push('duration');
      else if (m.durationMinutes > 30) exceeded.push('duration');
    }

    // Cost: > 2*stddev
    if (m.cost > 0 && costMean > 0 && costStd > 0 && m.cost > costMean + 2 * costStd) {
      exceeded.push('cost');
    }

    // Tool calls: > 2*stddev
    if (toolMean > 0 && toolStd > 0 && m.toolCallCount > toolMean + 2 * toolStd) {
      exceeded.push('tools');
    }

    // Correction rate: > 2*stddev
    if (corrMean > 0 && corrStd > 0 && m.correctionRate > corrMean + 2 * corrStd) {
      exceeded.push('corrections');
    }

    if (exceeded.length > 0) {
      anomalies.push({
        session: m.session,
        durationMinutes: m.durationMinutes,
        cost: m.cost,
        toolCallCount: m.toolCallCount,
        correctionRate: m.correctionRate,
        exceeded,
      });
    }
  }

  return anomalies;
}

// ---------------------------------------------------------------------------
// HTML generation helpers
// ---------------------------------------------------------------------------

function sourceBadgesHtml(sources: string[]): string {
  if (sources.length === 0) return '';
  const badges = sources
    .map((src) => `<span class="source-badge ${sourceBadgeClass(src)}">${escapeHtml(src)}</span>`)
    .join('\n    ');
  return `<div class="sources">
    ${badges}
  </div>`;
}

function filterBarHtml(sources: string[]): string {
  const buttons = sources
    .map((src) => `<button class="filter-btn" data-source="${escapeAttr(src)}" onclick="setFilter('${escapeAttr(src)}')">
    <span class="source-badge ${sourceBadgeClass(src)}">${escapeHtml(src)}</span>
  </button>`)
    .join('\n  ');

  return `<div class="filter-bar" id="filterBar">
  <button class="filter-btn active" data-source="all" onclick="setFilter('all')">All</button>
  ${buttons}
</div>`;
}

function polarityBarHtml(label: string, count: number, total: number): string {
  const barPct = total > 0 ? Math.round((count / total) * 100) : 0;
  return `    <div class="bar-row">
      <span class="bar-label">${escapeHtml(label)}</span>
      <div class="bar-track">
        <div class="bar-fill ${polarityClass(label)}" style="width: ${barPct}%"></div>
      </div>
      <span class="bar-value">${thousands(count)}</span>
    </div>`;
}

function sourceTableBodyHtml(sourcesData: Record<string, SourceMetrics>): string {
  const rows: string[] = [];
  for (const [src, data] of Object.entries(sourcesData)) {
    const toneCell =
      data.avgTone !== null
        ? `<span>${fmt2(data.avgTone)}</span>`
        : `<span style="color:var(--text-dim)">--</span>`;
    const costCell = data.cost > 0
      ? fmtDollars(data.cost)
      : '<span style="color:var(--text-dim)">--</span>';
    rows.push(`      <tr>
        <td><span class="source-badge ${sourceBadgeClass(src)}">${escapeHtml(src)}</span></td>
        <td>${thousands(data.sessions)}</td>
        <td>${thousands(data.messages)}</td>
        <td>${thousands(data.toolCalls)}</td>
        <td>${thousands(data.tokens)}</td>
        <td>${costCell}</td>
        <td>${toneCell}</td>
      </tr>`);
  }
  return rows.join('\n');
}

function anomaliesSectionHtml(anomalies: AnomalyInfo[], sentiment: { perSession: Array<{ id: string; avgCompound: number }> }): string {
  if (anomalies.length === 0) {
    return `<div class="section">
  <h2>Session Anomalies</h2>
  <div class="no-data" style="padding:1.5rem">
    <p>No anomalies detected today</p>
  </div>
</div>`;
  }

  const sentimentMap = new Map<string, number>();
  for (const pc of sentiment.perSession) {
    sentimentMap.set(pc.id, pc.avgCompound);
  }

  const items = anomalies.map((a) => {
    const toneScore = sentimentMap.get(a.session.id) ?? 0;
    const pillClass = toneScorePillClass(toneScore);
    const idShort = a.session.id.length > 20 ? a.session.id.slice(0, 20) + '...' : a.session.id;
    const anomalyBadges = a.exceeded.map(e => {
      let label = e;
      if (e === 'duration') label = a.durationMinutes !== null ? `${a.durationMinutes.toFixed(0)}m` : '30m+';
      else if (e === 'cost') label = fmtDollars(a.cost);
      else if (e === 'tools') label = a.toolCallCount + ' tools';
      else if (e === 'corrections') label = pct(a.correctionRate) + '% corr';
      return `<span class="anomaly-badge">${escapeHtml(label)}</span>`;
    }).join(' ');

    return `    <div class="session-item" data-source="${escapeAttr(a.session.source)}" data-session-id="${escapeAttr(a.session.id)}" onclick="openSession('${escapeAttr(a.session.id)}')">
      <div class="session-header">
        <div>
          <span class="source-badge ${sourceBadgeClass(a.session.source)}">${escapeHtml(a.session.source)}</span>
          <span class="session-id">${escapeHtml(a.session.title ?? idShort)}</span>
        </div>
        <span class="score-pill ${pillClass}" title="session score: ${fmt2(toneScore)}">${fmt2(toneScore)}</span>
      </div>
      <div class="session-meta" style="margin-bottom:0.25rem">
        ${anomalyBadges}
      </div>
      <div class="session-meta">
        <span>${thousands(a.session.messageCount)} msgs</span>
        <span>${thousands(a.session.toolCallCount)} tool calls</span>
      </div>
    </div>`;
  });

  return `<div class="section">
  <h2>Session Anomalies</h2>
  <div class="session-list">
${items.join('\n')}
  </div>
</div>`;
}

function allSessionsHtml(
  sessions: Session[],
  sentiment: { perSession: Array<{ id: string; avgCompound: number }> },
): string {
  const totalCost = sessions.reduce((sum, s) => sum + s.estimatedCostUsd, 0);

  const items = sessions.map((sess) => {
    const sessSentiment = sentiment.perSession.find((pc) => pc.id === sess.id);
    const toneScore = sessSentiment ? sessSentiment.avgCompound : 0;
    const pillClass = toneScorePillClass(toneScore);

    const tokenHtml =
      sess.tokensInput || sess.tokensOutput
        ? `<span class="token-badge in">in: ${thousands(sess.tokensInput ?? 0)}</span> <span class="token-badge out">out: ${thousands(sess.tokensOutput ?? 0)}</span>`
        : `<span class="token-badge total">${thousands(sess.totalTokens)} tokens</span>`;

    const idShort = sess.id.length > 20 ? sess.id.slice(0, 20) + '...' : sess.id;

    let durationMs = 0;
    if (sess.startedAt && sess.endedAt) {
      durationMs = sess.endedAt.getTime() - sess.startedAt.getTime();
    }
    const durationStr = durationMs > 0 ? formatDurationShort(durationMs) : '--';
    const costStr = fmtDollars(sess.estimatedCostUsd);

    return `    <div class="session-item" data-source="${escapeAttr(sess.source)}" data-session-id="${escapeAttr(sess.id)}" onclick="openSession('${escapeAttr(sess.id)}')">
      <div class="session-header">
        <div>
          <span class="source-badge ${sourceBadgeClass(sess.source)}">${escapeHtml(sess.source)}</span>
          <span class="session-id">${escapeHtml(sess.title ?? idShort)}</span>
        </div>
        <span class="score-pill ${pillClass}" title="session score: ${fmt2(toneScore)} \u2014 ${pillClass}">${fmt2(toneScore)}</span>
      </div>
      <div class="session-meta">
        <span>Model: ${escapeHtml(sess.model ?? 'unknown')}</span>
        <span>${thousands(sess.messageCount)} msgs</span>
        <span>${thousands(sess.toolCallCount)} tool calls</span>
        <span>${durationStr}</span>
        ${totalCost > 0 ? `<span>${costStr}</span>` : ''}
        ${tokenHtml}
      </div>
    </div>`;
  });

  return `<div class="section">
  <h2>Session Browser</h2>
  <div class="session-list">
${items.join('\n')}
  </div>
</div>`;
}

function buildSessionsJson(sessions: Session[]): string {
  const map: Record<string, SerializedSession> = {};
  for (const sess of sessions) {
    map[sess.id] = serializeSession(sess);
  }
  const json = JSON.stringify(map);
  return json.replace(/<\/script>/gi, '\\u003c/script>');
}

// ---------------------------------------------------------------------------
// Main HTML generator
// ---------------------------------------------------------------------------

function generateHtml(date: string, result: AnalysisResult, css: string): string {
  const { sentiment, tone, interaction, effectiveness, perSourceAnalysis, sourcesData, sessions } = result;

  const sources = Object.keys(sourcesData);
  const totalSessions = sessions.length;
  const totalMessages = tone.totalAgentMessages + totalSessions;

  if (totalSessions === 0) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agent Diary — ${escapeHtml(date)}</title>
<style>${css}</style>
</head>
<body>
<div class="header">
  <h1>Agent Diary</h1>
  <div class="sub">${escapeHtml(date)} &middot; generated ${escapeHtml(new Date().toISOString())}</div>
  ${sourceBadgesHtml(sources)}
</div>
<div class="no-data">
  <div class="icon">--</div>
  <p>No sessions found for ${escapeHtml(date)}</p>
</div>
</body>
</html>`;
  }

  const generatedAt = new Date().toISOString();
  const showFilter = sessions.length > 0 && sources.length > 1;

  // Totals for summary cards
  const totalTokens = sessions.reduce((sum, s) => sum + s.totalTokens, 0);
  const totalCost = sessions.reduce((sum, s) => sum + s.estimatedCostUsd, 0);
  const totalDurationMs = sessions.reduce((sum, s) => {
    if (s.startedAt && s.endedAt) return sum + (s.endedAt.getTime() - s.startedAt.getTime());
    return sum;
  }, 0);

  const polarityTotal = sentiment.polarityDistribution.positive + sentiment.polarityDistribution.neutral + sentiment.polarityDistribution.negative;

  const sessionsJson = buildSessionsJson(sessions);

  const sourceFilterData = buildSourceFilterData(result, sessions, sources);
  const sourceFilterJson = JSON.stringify(sourceFilterData);

  const anomalies = computeAnomalies(sessions, interaction);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agent Diary — ${escapeHtml(date)}</title>
<style>${css}</style>
</head>
<body>

<div class="header">
  <h1>Agent Diary</h1>
   <div class="sub">${escapeHtml(date)} &middot; generated ${escapeHtml(new Date(generatedAt).toLocaleString())}</div>
  ${sourceBadgesHtml(sources)}
</div>

${showFilter ? filterBarHtml(sources) : ''}

<!-- Usage Overview -->
<div class="section">
  <h2>Usage Overview</h2>
  <div class="cards">
    <div class="card">
      <div class="label">Sessions</div>
      <div class="value" data-metric="sessions-count">${thousands(totalSessions)}</div>
      <div class="subtext">${thousands(totalMessages)} messages</div>
    </div>
    ${totalCost > 0 ? `<div class="card">
      <div class="label">Cost</div>
      <div class="value" data-metric="cost">${fmtDollars(totalCost)}</div>
      <div class="subtext">estimated total cost</div>
    </div>` : ''}
    <div class="card">
      <div class="label">Tokens</div>
      <div class="value" data-metric="tokens">${thousands(totalTokens)}</div>
      <div class="subtext">total tokens used</div>
    </div>
    <div class="card">
      <div class="label">Duration</div>
      <div class="value" data-metric="duration">${formatDurationMs(totalDurationMs)}</div>
      <div class="subtext">total session time</div>
    </div>
  </div>
</div>

<!-- Agent Performance -->
<div class="section">
  <h2>Agent Performance</h2>
  <div class="metric-grid">
    <div class="metric">
      <div class="metric-label">Helpfulness</div>
      <div class="metric-value" data-metric="helpfulness">${pct(tone.helpfulnessRate)}%</div>
      <div class="metric-detail">${thousands(tone.helpfulnessCount)} helpful markers</div>
    </div>
    <div class="metric">
      <div class="metric-label">Self-Correction</div>
      <div class="metric-value" data-metric="self-correction">${pct(tone.selfCorrectionRate)}%</div>
      <div class="metric-detail">${thousands(tone.selfCorrectionCount)} backtrack markers</div>
    </div>
    <div class="metric">
      <div class="metric-label">Agent Questions</div>
      <div class="metric-value" data-metric="agent-questions">${pct(tone.questionRate)}%</div>
      <div class="metric-detail">${thousands(tone.questionCount)} questions asked</div>
    </div>
    <div class="metric">
      <div class="metric-label">Confidence</div>
      <div class="metric-value" data-metric="confidence">${fmt2(tone.confidenceNet)}</div>
      <div class="metric-detail">${thousands(tone.confidenceCount)} confident vs ${thousands(tone.uncertaintyCount)} uncertain</div>
    </div>
    <div class="metric">
      <div class="metric-label">User Correction Rate</div>
      <div class="metric-value" data-metric="correction-rate">${pct(interaction.correctionRatio)}%</div>
      <div class="metric-detail">${thousands(interaction.totalCorrections)} corrections / ${thousands(interaction.totalTurns)} turns</div>
    </div>
    <div class="metric">
      <div class="metric-label">Agent Clarification Rate</div>
      <div class="metric-value" data-metric="clarification-rate">${pct(interaction.clarificationRatio)}%</div>
      <div class="metric-detail">${thousands(interaction.totalClarifications)} clarifications / ${thousands(interaction.totalTurns)} turns</div>
    </div>
  </div>
</div>

<!-- Tool Usage -->
<div class="section">
  <h2>Tool Usage</h2>
  <div class="no-data" style="padding:1.5rem">
    <p>Detailed tool usage analytics coming soon.</p>
  </div>
</div>

<!-- Session Anomalies -->
${anomaliesSectionHtml(anomalies, sentiment)}

<!-- Per-Source Comparison -->
${sources.length > 1 ? `<!-- Per-Source Comparison -->
<div class="section">
  <h2>Per-Source Comparison</h2>
  <table class="source-table">
    <thead>
      <tr>
        <th>Source</th>
        <th>Sessions</th>
        <th>Messages</th>
        <th>Tool Calls</th>
        <th>Tokens</th>
        <th>Cost</th>
        <th>Avg Tone</th>
      </tr>
    </thead>
    <tbody>
${sourceTableBodyHtml(sourcesData)}
    </tbody>
  </table>
</div>` : ''}

<!-- Session Browser -->
${allSessionsHtml(sessions, sentiment)}

<!-- Session Viewer Modal -->
<div class="modal-overlay" id="modalOverlay" onclick="closeModal(event)">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-header">
      <h3 id="modalTitle"></h3>
      <button class="modal-close" onclick="closeModal()" title="Close">&times;</button>
    </div>
    <div class="modal-body" id="modalBody"></div>
  </div>
</div>

<script>
var SESSIONS = ${sessionsJson};
var SOURCE_DATA = ${sourceFilterJson};
var activeFilter = 'all';

function formatLocalTime(isoStr) {
  if (!isoStr) return '';
  try {
    var d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleString();
  } catch(e) {
    return isoStr;
  }
}

function openSession(id) {
  var sess = SESSIONS[id];
  if (!sess) return;

  var title = document.getElementById('modalTitle');
  var titleText = (sess.title || 'Session') + ' \u2014 ' + escapeHtml(sess.model || 'unknown');
  title.innerHTML = '<span class="source-badge ' + escapeHtml(sess.source) + '">' + escapeHtml(sess.source) + '</span> '
    + '<span>' + titleText + '</span> '
    + '<span class="meta">' + escapeHtml(formatLocalTime(sess.started)) + ' \u00b7 ' + sess.messages.length + ' msgs \u00b7 ' + escapeHtml(sess.duration) + '</span>';

  var body = document.getElementById('modalBody');
  var html = '';
  for (var i = 0; i < sess.messages.length; i++) {
    var msg = sess.messages[i];
    var roleClass = msg.role === 'toolResult' ? 'tool' : escapeHtml(msg.role);
    html += '<div id="msg-' + i + '" class="transcript-msg ' + roleClass + '">';
    html += '<div class="msg-header">';
    html += '<span class="role-badge">' + escapeHtml(msg.role) + '</span>';
    if (msg.tool) {
      html += '<span class="tool-info">' + escapeHtml(msg.tool) + '</span>';
    }
    if (msg.tool_result_attr) {
      html += '<span class="tool-info">from: ' + escapeHtml(msg.tool_result_attr) + '</span>';
    }
    if (msg.finish_reason) {
      html += '<span class="tool-info">stop: ' + escapeHtml(msg.finish_reason) + '</span>';
    }
    html += '<span class="msg-ts">' + escapeHtml(formatLocalTime(msg.ts)) + '</span>';
    html += '</div>';
    var display = null;
    if (msg.content) {
      display = msg.content;
    } else if (msg.tool) {
      if (msg.toolInput) {
        display = msg.tool + ': ' + msg.toolInput;
      } else {
        display = msg.tool;
      }
    }
    if (display) {
      var truncated = display.length > 2000 ? display.slice(0, 2000) + '\\n\\n[truncated \\u2014 ' + display.length + ' chars]' : display;
      html += '<div class="msg-body">' + escapeHtml(truncated) + '</div>';
    }
    html += '</div>';
  }
  body.innerHTML = html;

  document.getElementById('modalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function openSessionAtMessage(id, msgIdx) {
  openSession(id);
  setTimeout(function() {
    var target = document.getElementById('msg-' + msgIdx);
    if (target) {
      target.scrollIntoView({behavior: "smooth", block: "center"});
      target.classList.add("highlight-flash");
      setTimeout(function() {
        target.classList.remove("highlight-flash");
      }, 2000);
    }
  }, 100);
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function setFilter(source) {
  activeFilter = source;
  var btns = document.querySelectorAll('.filter-btn');
  btns.forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-source') === source);
  });

  var sdata = SOURCE_DATA[source] || SOURCE_DATA['all'];

  for (var key in sdata.cards) {
    var el = document.querySelector('[data-metric="' + key + '"]');
    if (el) {
      var c = sdata.cards[key];
      el.textContent = c.value;
      if (c.cls) el.className = 'value ' + c.cls;
      var card = el.closest('.card');
      if (card) {
        var subtexts = card.querySelectorAll('.subtext');
        if (subtexts.length > 0) subtexts[0].textContent = c.subtext;
      }
    }
  }

  for (var key in sdata.agentBehavior) {
    var el = document.querySelector('[data-metric="' + key + '"]');
    if (el) {
      var m = sdata.agentBehavior[key];
      el.textContent = m.value;
      var metric = el.closest('.metric');
      if (metric) {
        var detail = metric.querySelector('.metric-detail');
        if (detail) detail.textContent = m.detail;
      }
    }
  }

  var rows = document.querySelectorAll('.source-table tbody tr');
  rows.forEach(function(row) {
    var badge = row.querySelector('.source-badge');
    if (source === 'all' || (badge && badge.textContent.trim() === source)) {
      row.style.opacity = '1';
    } else {
      row.style.opacity = '0.3';
    }
  });

  var items = document.querySelectorAll('[data-source]');
  items.forEach(function(el) {
    if (source === 'all' || el.getAttribute('data-source') === source) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });

  var sections = document.querySelectorAll('.session-list');
  sections.forEach(function(list) {
    var visible = list.querySelectorAll('.session-item:not(.hidden)');
    var parent = list.parentElement;
    var heading = parent ? parent.querySelector('h2, h3') : null;
    if (visible.length === 0 && heading) {
      heading.style.opacity = '0.3';
    } else if (heading) {
      heading.style.opacity = '1';
    }
  });
}

function escapeHtml(text) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeModal();
});
</script>

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function renderReport(date: string, result: AnalysisResult, outputPath: string): void {
  const css = loadCSS();
  const html = generateHtml(date, result, css);

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, html, 'utf-8');
}
