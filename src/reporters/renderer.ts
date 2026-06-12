import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AnalysisResult, Session, NotableChat } from '../types.js';
import { analyzeSentiment } from '../analyzers/sentiment.js';
import { analyzeTone } from '../analyzers/tone.js';
import { analyzeInteraction } from '../analyzers/interaction.js';

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
  started: string;
  messages: SerializedMessage[];
  tokensInput: number;
  tokensOutput: number;
  totalTokens: number;
}

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

function formatToolInput(tc: Record<string, unknown>): string | null {
  // Extract input/arguments from tool call
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
  
  // Get tool name for context-aware formatting
  let toolName = '';
  if (typeof tc.name === 'string') toolName = tc.name;
  else if (tc.function && typeof tc.function === 'object' && typeof (tc.function as Record<string, unknown>).name === 'string') toolName = (tc.function as Record<string, unknown>).name as string;
  
  // Format based on tool type for better readability
  const name = toolName.toLowerCase();
  
  if (name === 'bash' || name === 'execute' || name === 'execute_command') {
    // For bash commands, show the command prominently
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
  
  // Default: show key params
  const keys = Object.keys(input);
  if (keys.length === 0) return null;
  
  // Try to find a 'main' param like command, path, query, text, content
  for (const key of ['command', 'cmd', 'path', 'query', 'text', 'content', 'url', 'name', 'id']) {
    if (input[key] !== undefined) {
      const val = input[key];
      if (typeof val === 'string') return val.length > 200 ? val.slice(0, 200) + '...' : val;
      return String(val);
    }
  }
  
  // Fallback: compact JSON
  const json = JSON.stringify(input);
  return json.length > 200 ? json.slice(0, 200) + '...' : json;
}

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
    
    // Get formatted tool input from first tool call
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

  return {
    source: sess.source,
    model: sess.model,
    started,
    messages,
    tokensInput: sess.tokensInput,
    tokensOutput: sess.tokensOutput,
    totalTokens: sess.totalTokens,
  };
}

function sourceBadgeClass(source: string): string {
  const known = ['hermes', 'pi', 'opencode', 'claude', 'codex'];
  return known.includes(source) ? source : '';
}

function loadCSS(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const templatePath = path.resolve(__dirname, '../../templates/report.html');
  const templateContent = fs.readFileSync(templatePath, 'utf-8');
  const styleMatch = templateContent.match(/<style>([\s\S]*?)<\/style>/);
  return styleMatch ? styleMatch[1].trim() : '';
}

function computeEffectivenessIndex(
  sentimentResult: { overallCompound: number },
  toneResult: { confidenceNet: number },
  interactionResult: { cleanExitRatio: number },
): import('../types.js').EffectivenessIndex {
  const sentScore = ((sentimentResult.overallCompound + 1) / 2) * 40;
  const confScore = ((toneResult.confidenceNet + 1) / 2) * 30;
  const exitScore = interactionResult.cleanExitRatio * 30;
  const score = Math.min(100, Math.max(0, Math.round(sentScore + confScore + exitScore)));
  let label: import('../types.js').EffectivenessIndex['label'];
  if (score >= 70) label = 'effective';
  else if (score >= 40) label = 'balanced';
  else label = 'struggling';
  return { score, label };
}

function buildSourceFilterData(
  sessions: Session[],
  sources: string[],
  sentiment: import('../types.js').SentimentResult,
  tone: import('../types.js').ToneResult,
  interaction: import('../types.js').InteractionResult,
  effectiveness: import('../types.js').EffectivenessIndex,
  totalSessions: number,
  totalMessages: number,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  data['all'] = {
    cards: {
      'overall-tone': { value: sentiment.dominantTone, subtext: 'compound ' + fmt2(sentiment.overallCompound), cls: polarityClass(sentiment.dominantTone) },
      'effectiveness-score': { value: fmt2(effectiveness.score), subtext: effectiveness.label, cls: effectivenessClass(effectiveness.label) },
      'sessions-count': { value: thousands(totalSessions), subtext: thousands(totalMessages) + ' messages' },
      'avg-turns': { value: fmt2(interaction.avgTurnsPerSession), subtext: 'avg turns per session' },
    },
    agentBehavior: {
      'apology-rate': { value: pct(tone.apologyRate) + '%', detail: thousands(tone.apologyCount) + ' apologies in ' + thousands(tone.totalAgentMessages) + ' messages' },
      'confidence': { value: fmt2(tone.confidenceNet), detail: thousands(tone.confidenceCount) + ' confident vs ' + thousands(tone.uncertaintyCount) + ' uncertain markers' },
      'helpfulness': { value: pct(tone.helpfulnessRate) + '%', detail: thousands(tone.helpfulnessCount) + ' helpful markers' },
      'self-correction': { value: pct(tone.selfCorrectionRate) + '%', detail: thousands(tone.selfCorrectionCount) + ' backtrack markers' },
      'agent-questions': { value: pct(tone.questionRate) + '%', detail: thousands(tone.questionCount) + ' clarification questions asked' },
      'avg-response-length': { value: fmt2(tone.avgMessageLength), detail: 'chars per agent response' },
    },
    interactionQuality: {
      'iq-sessions': { value: thousands(interaction.totalSessions), detail: thousands(interaction.cleanExits) + ' clean exits, ' + thousands(interaction.danglingExits) + ' dangling' },
      'iq-avg-turns': { value: fmt2(interaction.avgTurnsPerSession), detail: 'user-assistant exchanges per session' },
      'correction-rate': { value: pct(interaction.correctionRatio) + '%', detail: thousands(interaction.totalCorrections) + ' correction messages / ' + thousands(interaction.totalTurns) + ' turns' },
      'clarification-rate': { value: pct(interaction.clarificationRatio) + '%', detail: thousands(interaction.totalClarifications) + ' clarification questions / ' + thousands(interaction.totalTurns) + ' turns' },
      'redo-rate': { value: '' + interaction.avgRedosPerSession, detail: 'avg repeated tool calls per session' },
      'exit-quality': { value: pct(interaction.cleanExitRatio) + '%', detail: 'clean session end rate' },
    },
  };

  for (const src of sources) {
    const srcSessions = sessions.filter(s => s.source === src);
    if (srcSessions.length === 0) continue;
    const srcSentiment = analyzeSentiment(srcSessions);
    const srcTone = analyzeTone(srcSessions);
    const srcInteraction = analyzeInteraction(srcSessions);
    const srcEffectiveness = computeEffectivenessIndex(srcSentiment, srcTone, srcInteraction);
    const srcTotalMessages = srcTone.totalAgentMessages + srcSessions.length;
    data[src] = {
      cards: {
        'overall-tone': { value: srcSentiment.dominantTone, subtext: 'compound ' + fmt2(srcSentiment.overallCompound), cls: polarityClass(srcSentiment.dominantTone) },
        'effectiveness-score': { value: fmt2(srcEffectiveness.score), subtext: srcEffectiveness.label, cls: effectivenessClass(srcEffectiveness.label) },
        'sessions-count': { value: thousands(srcSessions.length), subtext: thousands(srcTotalMessages) + ' messages' },
        'avg-turns': { value: fmt2(srcInteraction.avgTurnsPerSession), subtext: 'avg turns per session' },
      },
      agentBehavior: {
        'apology-rate': { value: pct(srcTone.apologyRate) + '%', detail: thousands(srcTone.apologyCount) + ' apologies in ' + thousands(srcTone.totalAgentMessages) + ' messages' },
        'confidence': { value: fmt2(srcTone.confidenceNet), detail: thousands(srcTone.confidenceCount) + ' confident vs ' + thousands(srcTone.uncertaintyCount) + ' uncertain markers' },
        'helpfulness': { value: pct(srcTone.helpfulnessRate) + '%', detail: thousands(srcTone.helpfulnessCount) + ' helpful markers' },
        'self-correction': { value: pct(srcTone.selfCorrectionRate) + '%', detail: thousands(srcTone.selfCorrectionCount) + ' backtrack markers' },
        'agent-questions': { value: pct(srcTone.questionRate) + '%', detail: thousands(srcTone.questionCount) + ' clarification questions asked' },
        'avg-response-length': { value: fmt2(srcTone.avgMessageLength), detail: 'chars per agent response' },
      },
      interactionQuality: {
        'iq-sessions': { value: thousands(srcInteraction.totalSessions), detail: thousands(srcInteraction.cleanExits) + ' clean exits, ' + thousands(srcInteraction.danglingExits) + ' dangling' },
        'iq-avg-turns': { value: fmt2(srcInteraction.avgTurnsPerSession), detail: 'user-assistant exchanges per session' },
        'correction-rate': { value: pct(srcInteraction.correctionRatio) + '%', detail: thousands(srcInteraction.totalCorrections) + ' correction messages / ' + thousands(srcInteraction.totalTurns) + ' turns' },
        'clarification-rate': { value: pct(srcInteraction.clarificationRatio) + '%', detail: thousands(srcInteraction.totalClarifications) + ' clarification questions / ' + thousands(srcInteraction.totalTurns) + ' turns' },
        'redo-rate': { value: '' + srcInteraction.avgRedosPerSession, detail: 'avg repeated tool calls per session' },
        'exit-quality': { value: pct(srcInteraction.cleanExitRatio) + '%', detail: 'clean session end rate' },
      },
    };
  }

  return data;
}

function generateHtml(date: string, result: AnalysisResult, css: string): string {
  const { sentiment, tone, interaction, effectiveness, sourcesData, notable, sessions } = result;

  const sources = Object.keys(sourcesData);
  const totalSessions = sessions.length;
  const totalMessages = tone.totalAgentMessages + totalSessions; // agent + user roughly

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
  const toneMax = Math.max(
    sentiment.polarityDistribution.positive,
    sentiment.polarityDistribution.neutral,
    sentiment.polarityDistribution.negative,
  ) || 1;

  const sessionsJson = buildSessionsJson(sessions);

  const sourceFilterData = buildSourceFilterData(
    sessions, sources, sentiment, tone, interaction, effectiveness, totalSessions, totalMessages
  );
  const sourceFilterJson = JSON.stringify(sourceFilterData);

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

<!-- Summary Cards -->
<div class="cards">
  <div class="card">
    <div class="label">Overall Tone</div>
    <div class="value ${polarityClass(sentiment.dominantTone)}" data-metric="overall-tone">${escapeHtml(sentiment.dominantTone)}</div>
    <div class="subtext">compound ${fmt2(sentiment.overallCompound)}</div>
  </div>

  <div class="card">
    <div class="label">Effectiveness</div>
    <div class="value ${effectivenessClass(effectiveness.label)}" data-metric="effectiveness-score">${fmt2(effectiveness.score)}</div>
    <div class="subtext">${escapeHtml(effectiveness.label)}</div>
    <div class="subtext" style="font-size:0.75em;opacity:0.7;">Range: -0.7 to 1.0 — higher is better</div>
  </div>

  <div class="card">
    <div class="label">Sessions</div>
    <div class="value" data-metric="sessions-count">${thousands(totalSessions)}</div>
    <div class="subtext">${thousands(totalMessages)} messages</div>
  </div>

  <div class="card">
    <div class="label">Interaction</div>
    <div class="value" data-metric="avg-turns">${fmt2(interaction.avgTurnsPerSession)}</div>
    <div class="subtext">avg turns per session</div>
  </div>
</div>

<!-- Polarity Distribution -->
<div class="section">
  <h2>Tone Distribution</h2>
  <div class="bar-chart">
    ${polarityBarHtml('positive', sentiment.polarityDistribution.positive, toneMax)}
    ${polarityBarHtml('neutral', sentiment.polarityDistribution.neutral, toneMax)}
    ${polarityBarHtml('negative', sentiment.polarityDistribution.negative, toneMax)}
  </div>
</div>

<!-- Agent Behavior -->
<div class="section">
  <h2>Agent Behavior</h2>
  <div class="metric-grid">
    <div class="metric">
      <div class="metric-label">Apology Rate</div>
      <div class="metric-value" data-metric="apology-rate">${pct(tone.apologyRate)}%</div>
      <div class="metric-detail">${thousands(tone.apologyCount)} apologies in ${thousands(tone.totalAgentMessages)} messages</div>
    </div>
    <div class="metric">
      <div class="metric-label">Confidence</div>
      <div class="metric-value" data-metric="confidence">${fmt2(tone.confidenceNet)}</div>
      <div class="metric-detail">${thousands(tone.confidenceCount)} confident vs ${thousands(tone.uncertaintyCount)} uncertain markers</div>
    </div>
    <div class="metric">
      <div class="metric-label">Helpfulness</div>
      <div class="metric-value" data-metric="helpfulness">${pct(tone.helpfulnessRate)}%</div>
      <div class="metric-detail">${thousands(tone.helpfulnessCount)} helpful markers</div>
    </div>
    <div class="metric">
      <div class="metric-label">Self-correction</div>
      <div class="metric-value" data-metric="self-correction">${pct(tone.selfCorrectionRate)}%</div>
      <div class="metric-detail">${thousands(tone.selfCorrectionCount)} backtrack markers</div>
    </div>
    <div class="metric">
      <div class="metric-label">Agent Questions</div>
      <div class="metric-value" data-metric="agent-questions">${pct(tone.questionRate)}%</div>
      <div class="metric-detail">${thousands(tone.questionCount)} clarification questions asked</div>
    </div>
    <div class="metric">
      <div class="metric-label">Avg Response Length</div>
      <div class="metric-value" data-metric="avg-response-length">${fmt2(tone.avgMessageLength)}</div>
      <div class="metric-detail">chars per agent response</div>
    </div>
  </div>
</div>

<!-- Interaction Quality -->
<div class="section">
  <h2>Interaction Quality</h2>
  <div class="metric-grid">
    <div class="metric">
      <div class="metric-label">Sessions</div>
      <div class="metric-value" data-metric="iq-sessions">${thousands(interaction.totalSessions)}</div>
      <div class="metric-detail">${thousands(interaction.cleanExits)} clean exits, ${thousands(interaction.danglingExits)} dangling</div>
    </div>
    <div class="metric">
      <div class="metric-label">Avg Turns</div>
      <div class="metric-value" data-metric="iq-avg-turns">${fmt2(interaction.avgTurnsPerSession)}</div>
      <div class="metric-detail">user-assistant exchanges per session</div>
    </div>
    <div class="metric">
      <div class="metric-label">Correction Rate</div>
      <div class="metric-value" data-metric="correction-rate">${pct(interaction.correctionRatio)}%</div>
      <div class="metric-detail">${thousands(interaction.totalCorrections)} correction messages / ${thousands(interaction.totalTurns)} turns</div>
    </div>
    <div class="metric">
      <div class="metric-label">Clarification Rate</div>
      <div class="metric-value" data-metric="clarification-rate">${pct(interaction.clarificationRatio)}%</div>
      <div class="metric-detail">${thousands(interaction.totalClarifications)} clarification questions / ${thousands(interaction.totalTurns)} turns</div>
    </div>
    <div class="metric">
      <div class="metric-label">Re-do Rate</div>
      <div class="metric-value" data-metric="redo-rate">${interaction.avgRedosPerSession}</div>
      <div class="metric-detail">avg repeated tool calls per session</div>
    </div>
    <div class="metric">
      <div class="metric-label">Exit Quality</div>
      <div class="metric-value" data-metric="exit-quality">${pct(interaction.cleanExitRatio)}%</div>
      <div class="metric-detail">clean session end rate</div>
    </div>
  </div>
</div>

<!-- Per-Source Breakdown -->
<div class="section">
  <h2>Per-Source Breakdown</h2>
  <table class="source-table">
    <thead>
      <tr>
        <th>Source</th>
        <th>Sessions</th>
        <th>Messages</th>
        <th>Tool Calls</th>
        <th>Tokens</th>
        <th>Avg Tone</th>
      </tr>
    </thead>
    <tbody>
${sourceTableBodyHtml(sourcesData)}
    </tbody>
  </table>
</div>

<!-- Notable Chats -->
${notableChatsHtml(notable)}

<!-- All Sessions -->
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
  title.innerHTML = '<span class="source-badge ' + escapeHtml(sess.source) + '">' + escapeHtml(sess.source) + '</span> '
    + '<span>' + escapeHtml(sess.model || 'unknown') + '</span> '
    + '<span class="meta">' + escapeHtml(formatLocalTime(sess.started)) + ' &middot; ' + sess.messages.length + ' msgs</span>';

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
      // Show tool name with its actual input/command
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

  for (var key in sdata.interactionQuality) {
    var el = document.querySelector('[data-metric="' + key + '"]');
    if (el) {
      var m = sdata.interactionQuality[key];
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

function polarityBarHtml(label: string, count: number, max: number): string {
  const barPct = max > 0 ? Math.round((count / max) * 100) : 0;
  return `    <div class="bar-row">
      <span class="bar-label">${escapeHtml(label)}</span>
      <div class="bar-track">
        <div class="bar-fill ${polarityClass(label)}" style="width: ${barPct}%"></div>
      </div>
      <span class="bar-value">${thousands(count)}</span>
    </div>`;
}

function sourceTableBodyHtml(sourcesData: Record<string, import('../types.js').SourceMetrics>): string {
  const rows: string[] = [];
  for (const [src, data] of Object.entries(sourcesData)) {
    const toneCell =
      data.avgTone !== null
        ? `<span>${fmt2(data.avgTone)}</span>`
        : `<span style="color:var(--text-dim)">--</span>`;
    rows.push(`      <tr>
        <td><span class="source-badge ${sourceBadgeClass(src)}">${escapeHtml(src)}</span></td>
        <td>${thousands(data.sessions)}</td>
        <td>${thousands(data.messages)}</td>
        <td>${thousands(data.toolCalls)}</td>
        <td>${thousands(data.tokens)}</td>
        <td>${toneCell}</td>
      </tr>`);
  }
  return rows.join('\n');
}

function notableChatsHtml(notable: { best: NotableChat[]; worst: NotableChat[] }): string {
  if (notable.best.length === 0 && notable.worst.length === 0) return '';

  let html = '<div class="section">\n  <h2>Notable Chats</h2>\n';

  if (notable.best.length > 0) {
    html += '\n  <h3 style="color:var(--green)">Most Positive Messages</h3>\n';
    html += '  <div class="session-list">\n';
    for (const s of notable.best) {
      html += notableChatItemHtml(s, 'good');
    }
    html += '  </div>\n';
  }

  if (notable.worst.length > 0) {
    html += '\n  <h3 style="color:var(--red); margin-top:1.5rem">Most Negative Messages</h3>\n';
    html += '  <div class="session-list">\n';
    for (const s of notable.worst) {
      html += notableChatItemHtml(s, 'bad');
    }
    html += '  </div>\n';
  }

  html += '</div>';
  return html;
}

function notableChatItemHtml(s: NotableChat, pillClass: string): string {
  const tokenHtml =
    s.tokensInput || s.tokensOutput
      ? `<span class="token-badge in">in: ${thousands(s.tokensInput ?? 0)}</span> <span class="token-badge out">out: ${thousands(s.tokensOutput ?? 0)}</span>`
      : '';

  return `    <div class="session-item" data-source="${escapeAttr(s.source)}" data-session-id="${escapeAttr(s.sessionId)}" data-msg-idx="${s.msgIdx}" onclick="openSessionAtMessage('${escapeAttr(s.sessionId)}', ${s.msgIdx})">
      <div class="session-header">
        <span class="source-badge ${sourceBadgeClass(s.source)}">${escapeHtml(s.source)}</span>
        <span class="score-pill ${pillClass}">${fmt2(s.compound)}</span>
      </div>
      <div class="session-preview">${escapeHtml(s.contentPreview)}</div>
      <div class="session-meta">
        <span>msg #${s.msgIdx}</span>
        ${tokenHtml}
      </div>
    </div>`;
}

function allSessionsHtml(
  sessions: Session[],
  sentiment: import('../types.js').SentimentResult,
): string {
  const items = sessions.map((sess) => {
    const sessSentiment = sentiment.perSession.find((pc) => pc.id === sess.id);
    const toneScore = sessSentiment ? sessSentiment.avgCompound : 0;
    const pillClass = toneScorePillClass(toneScore);

    const tokenHtml =
      sess.tokensInput || sess.tokensOutput
        ? `<span class="token-badge in">in: ${thousands(sess.tokensInput ?? 0)}</span> <span class="token-badge out">out: ${thousands(sess.tokensOutput ?? 0)}</span>`
        : `<span class="token-badge total">${thousands(sess.totalTokens)} tokens</span>`;

    const idShort = sess.id.length > 20 ? sess.id.slice(0, 20) + '...' : sess.id;

    return `    <div class="session-item" data-source="${escapeAttr(sess.source)}" data-session-id="${escapeAttr(sess.id)}" onclick="openSession('${escapeAttr(sess.id)}')">
      <div class="session-header">
        <div>
          <span class="source-badge ${sourceBadgeClass(sess.source)}">${escapeHtml(sess.source)}</span>
          <span class="session-id">${escapeHtml(idShort)}</span>
        </div>
        <span class="score-pill ${pillClass}">${fmt2(toneScore)}</span>
      </div>
      <div class="session-meta">
        <span>Model: ${escapeHtml(sess.model ?? 'unknown')}</span>
        <span>${thousands(sess.messageCount)} msgs</span>
        <span>${thousands(sess.toolCallCount)} tool calls</span>
        ${tokenHtml}
      </div>
    </div>`;
  });

  return `<div class="section">
  <h2>All Sessions (${thousands(sessions.length)})</h2>
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

export function renderReport(date: string, result: AnalysisResult, outputPath: string): void {
  const css = loadCSS();
  const html = generateHtml(date, result, css);

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, html, 'utf-8');
}
