import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AnalysisResult, Conversation, NotableChat } from '../types.js';

interface SerializedMessage {
  role: string;
  content: string;
  tool: string | null;
  tool_result_attr: string | null;
  finish_reason: string | null;
  ts: string;
}

interface SerializedConv {
  source: string;
  model: string | null;
  started: string;
  messages: SerializedMessage[];
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

function serializeConversation(conv: Conversation): SerializedConv {
  const started = conv.startedAt ? conv.startedAt.toISOString() : '';
  const messages: SerializedMessage[] = conv.messages.map((msg) => {
    const toolNames = msg.toolCalls
      .map((tc) => tc.name ?? tc.function ?? '')
      .filter(Boolean);
    const tool = msg.toolName ?? (toolNames.length > 0 ? toolNames.join(', ') : null);

    return {
      role: msg.role,
      content: msg.content,
      tool,
      tool_result_attr: null,
      finish_reason: msg.finishReason,
      ts: msg.timestamp ? msg.timestamp.toISOString() : '',
    };
  });

  return {
    source: conv.source,
    model: conv.model,
    started,
    messages,
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

function generateHtml(date: string, result: AnalysisResult, css: string): string {
  const { sentiment, tone, interaction, effectiveness, sourcesData, notable, conversations } = result;

  const sources = Object.keys(sourcesData);
  const totalConversations = conversations.length;
  const totalMessages = tone.totalAgentMessages + totalConversations; // agent + user roughly

  if (totalConversations === 0) {
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
  const showFilter = conversations.length > 0 && sources.length > 1;
  const toneMax = Math.max(
    sentiment.polarityDistribution.positive,
    sentiment.polarityDistribution.neutral,
    sentiment.polarityDistribution.negative,
  ) || 1;

  const conversationsJson = buildConversationsJson(conversations);

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
  <div class="sub">${escapeHtml(date)} &middot; generated ${escapeHtml(generatedAt)}</div>
  ${sourceBadgesHtml(sources)}
</div>

${showFilter ? filterBarHtml(sources) : ''}

<!-- Summary Cards -->
<div class="cards">
  <div class="card">
    <div class="label">Overall Tone</div>
    <div class="value ${polarityClass(sentiment.dominantTone)}">${escapeHtml(sentiment.dominantTone)}</div>
    <div class="subtext">compound ${fmt2(sentiment.overallCompound)}</div>
  </div>

  <div class="card">
    <div class="label">Effectiveness</div>
    <div class="value ${effectivenessClass(effectiveness.label)}">${effectiveness.score}%</div>
    <div class="subtext">${escapeHtml(effectiveness.label)}</div>
  </div>

  <div class="card">
    <div class="label">Conversations</div>
    <div class="value">${thousands(totalConversations)}</div>
    <div class="subtext">${thousands(totalMessages)} messages</div>
  </div>

  <div class="card">
    <div class="label">Interaction</div>
    <div class="value">${fmt2(interaction.avgTurnsPerSession)}</div>
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
      <div class="metric-value">${pct(tone.apologyRate)}%</div>
      <div class="metric-detail">${thousands(tone.apologyCount)} apologies in ${thousands(tone.totalAgentMessages)} messages</div>
    </div>
    <div class="metric">
      <div class="metric-label">Confidence</div>
      <div class="metric-value">${fmt2(tone.confidenceNet)}</div>
      <div class="metric-detail">${thousands(tone.confidenceCount)} confident vs ${thousands(tone.uncertaintyCount)} uncertain markers</div>
    </div>
    <div class="metric">
      <div class="metric-label">Helpfulness</div>
      <div class="metric-value">${pct(tone.helpfulnessRate)}%</div>
      <div class="metric-detail">${thousands(tone.helpfulnessCount)} helpful markers</div>
    </div>
    <div class="metric">
      <div class="metric-label">Self-correction</div>
      <div class="metric-value">${pct(tone.selfCorrectionRate)}%</div>
      <div class="metric-detail">${thousands(tone.selfCorrectionCount)} backtrack markers</div>
    </div>
    <div class="metric">
      <div class="metric-label">Agent Questions</div>
      <div class="metric-value">${pct(tone.questionRate)}%</div>
      <div class="metric-detail">${thousands(tone.questionCount)} clarification questions asked</div>
    </div>
    <div class="metric">
      <div class="metric-label">Avg Response Length</div>
      <div class="metric-value">${fmt2(tone.avgMessageLength)}</div>
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
      <div class="metric-value">${thousands(interaction.totalSessions)}</div>
      <div class="metric-detail">${thousands(interaction.cleanExits)} clean exits, ${thousands(interaction.danglingExits)} dangling</div>
    </div>
    <div class="metric">
      <div class="metric-label">Avg Turns</div>
      <div class="metric-value">${fmt2(interaction.avgTurnsPerSession)}</div>
      <div class="metric-detail">user-assistant exchanges per session</div>
    </div>
    <div class="metric">
      <div class="metric-label">Correction Rate</div>
      <div class="metric-value">${pct(interaction.correctionRatio)}%</div>
      <div class="metric-detail">${thousands(interaction.totalCorrections)} correction messages / ${thousands(interaction.totalTurns)} turns</div>
    </div>
    <div class="metric">
      <div class="metric-label">Clarification Rate</div>
      <div class="metric-value">${pct(interaction.clarificationRatio)}%</div>
      <div class="metric-detail">${thousands(interaction.totalClarifications)} clarification questions / ${thousands(interaction.totalTurns)} turns</div>
    </div>
    <div class="metric">
      <div class="metric-label">Re-do Rate</div>
      <div class="metric-value">${interaction.avgRedosPerSession}</div>
      <div class="metric-detail">avg repeated tool calls per session</div>
    </div>
    <div class="metric">
      <div class="metric-label">Exit Quality</div>
      <div class="metric-value">${pct(interaction.cleanExitRatio)}%</div>
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
${allSessionsHtml(conversations, sentiment)}

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
var CONVERSATIONS = ${conversationsJson};
var activeFilter = 'all';

function openSession(id) {
  var conv = CONVERSATIONS[id];
  if (!conv) return;

  var title = document.getElementById('modalTitle');
  title.innerHTML = '<span class="source-badge ' + escapeHtml(conv.source) + '">' + escapeHtml(conv.source) + '</span> '
    + '<span>' + escapeHtml(conv.model || 'unknown') + '</span> '
    + '<span class="meta">' + escapeHtml(conv.started || '') + ' &middot; ' + conv.messages.length + ' msgs</span>';

  var body = document.getElementById('modalBody');
  var html = '';
  for (var i = 0; i < conv.messages.length; i++) {
    var msg = conv.messages[i];
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
    html += '<span class="msg-ts">' + escapeHtml(msg.ts) + '</span>';
    html += '</div>';
    var display = null;
    if (msg.content) {
      display = msg.content;
    } else if (msg.tool) {
      display = '[tool calls: ' + msg.tool + ']';
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

  return `    <div class="session-item" data-source="${escapeAttr(s.source)}" data-conv-id="${escapeAttr(s.convId)}" data-msg-idx="${s.msgIdx}" onclick="openSessionAtMessage('${escapeAttr(s.convId)}', ${s.msgIdx})">
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
  conversations: Conversation[],
  sentiment: import('../types.js').SentimentResult,
): string {
  const items = conversations.map((conv) => {
    const convSentiment = sentiment.perConversation.find((pc) => pc.id === conv.id);
    const toneScore = convSentiment ? convSentiment.avgCompound : 0;
    const pillClass = toneScorePillClass(toneScore);

    const tokenHtml =
      conv.tokensInput || conv.tokensOutput
        ? `<span class="token-badge in">in: ${thousands(conv.tokensInput ?? 0)}</span> <span class="token-badge out">out: ${thousands(conv.tokensOutput ?? 0)}</span>`
        : `<span class="token-badge total">${thousands(conv.totalTokens)} tokens</span>`;

    const idShort = conv.id.length > 20 ? conv.id.slice(0, 20) + '...' : conv.id;

    return `    <div class="session-item" data-source="${escapeAttr(conv.source)}" data-session-id="${escapeAttr(conv.id)}" onclick="openSession('${escapeAttr(conv.id)}')">
      <div class="session-header">
        <div>
          <span class="source-badge ${sourceBadgeClass(conv.source)}">${escapeHtml(conv.source)}</span>
          <span class="session-id">${escapeHtml(idShort)}</span>
        </div>
        <span class="score-pill ${pillClass}">${fmt2(toneScore)}</span>
      </div>
      <div class="session-meta">
        <span>Model: ${escapeHtml(conv.model ?? 'unknown')}</span>
        <span>${thousands(conv.messageCount)} msgs</span>
        <span>${thousands(conv.toolCallCount)} tool calls</span>
        ${tokenHtml}
      </div>
    </div>`;
  });

  return `<div class="section">
  <h2>All Sessions (${thousands(conversations.length)})</h2>
  <div class="session-list">
${items.join('\n')}
  </div>
</div>`;
}

function buildConversationsJson(conversations: Conversation[]): string {
  const map: Record<string, SerializedConv> = {};
  for (const conv of conversations) {
    map[conv.id] = serializeConversation(conv);
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
