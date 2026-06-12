import { parseArgs } from "node:util";
import path from "node:path";
import { detectSources } from "./parsers/detector.js";
import { parseHermes } from "./parsers/hermes.js";
import { parsePi } from "./parsers/pi.js";
import { parseClaude } from "./parsers/claude.js";
import { parseOpencode } from "./parsers/opencode.js";
import { analyzeSentiment } from "./analyzers/sentiment.js";
import { analyzeTone } from "./analyzers/tone.js";
import { analyzeInteraction } from "./analyzers/interaction.js";
import { renderReport } from "./reporters/renderer.js";
import type {
  Conversation,
  AnalysisResult,
  SourceMetrics,
  SentimentResult,
  EffectivenessIndex,
  NotableChat,
} from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function printUsage(): void {
  console.log(`
Usage: npx agent-diary [options]

Options:
  -d, --date <YYYY-MM-DD>    Target date (default: today)
  -s, --sources <list>       Comma-separated sources: hermes,pi,claude,opencode
  -o, --output <path>        Custom output HTML path
  -h, --help                 Show this help

Examples:
  npx agent-diary
  npx agent-diary --date 2026-06-12
  npx agent-diary --sources hermes,claude --output report.html
`);
}

/**
 * Combine sentiment + tone + interaction into a single [0-100] effectiveness
 * score and a human-readable label.
 */
function computeEffectivenessIndex(
  sentimentResult: { overallCompound: number },
  toneResult: { confidenceNet: number },
  interactionResult: { cleanExitRatio: number },
): EffectivenessIndex {
  // Map compound [-1, 1] → [0, 40]
  const sentScore = ((sentimentResult.overallCompound + 1) / 2) * 40;
  // Map confidenceNet [-1, 1] → [0, 30]
  const confScore = ((toneResult.confidenceNet + 1) / 2) * 30;
  // cleanExitRatio [0, 1] → [0, 30]
  const exitScore = interactionResult.cleanExitRatio * 30;

  const score = Math.min(100, Math.max(0, Math.round(sentScore + confScore + exitScore)));

  let label: EffectivenessIndex["label"];
  if (score >= 70) {
    label = "effective";
  } else if (score >= 40) {
    label = "balanced";
  } else {
    label = "struggling";
  }

  return { score, label };
}

/**
 * Aggregate per-source metrics (session count, message count, tool calls,
 * tokens, average tone) from the flattened conversations and sentiment data.
 */
function computeSourceMetrics(
  conversations: Conversation[],
  sentimentResult: SentimentResult,
): Record<string, SourceMetrics> {
  // Count unique sessions per source
  const perSource: Record<
    string,
    { sessions: Set<string>; messages: number; toolCalls: number; tokens: number }
  > = {};

  for (const conv of conversations) {
    if (!perSource[conv.source]) {
      perSource[conv.source] = {
        sessions: new Set(),
        messages: 0,
        toolCalls: 0,
        tokens: 0,
      };
    }
    const entry = perSource[conv.source];
    entry.sessions.add(conv.id);
    entry.messages += conv.messageCount;
    entry.toolCalls += conv.toolCallCount;
    entry.tokens += conv.totalTokens;
  }

  // Group per-conversation compounds by source for avg tone
  const compoundsBySource: Record<string, number[]> = {};
  for (const pc of sentimentResult.perConversation) {
    if (!compoundsBySource[pc.source]) compoundsBySource[pc.source] = [];
    compoundsBySource[pc.source].push(pc.avgCompound);
  }

  const metrics: Record<string, SourceMetrics> = {};
  for (const [source, data] of Object.entries(perSource)) {
    const compounds = compoundsBySource[source] ?? [];
    const avgTone =
      compounds.length > 0
        ? compounds.reduce((a, b) => a + b, 0) / compounds.length
        : null;

    metrics[source] = {
      sessions: data.sessions.size,
      messages: data.messages,
      toolCalls: data.toolCalls,
      tokens: data.tokens,
      avgTone,
    };
  }

  return metrics;
}

/**
 * Pick the top-N best and worst messages by compound sentiment score.
 */
function computeNotableChats(
  sentimentResult: SentimentResult,
  n: number,
): { best: NotableChat[]; worst: NotableChat[] } {
  const sorted = [...sentimentResult.perMessage].sort(
    (a, b) => b.compound - a.compound,
  );

  const best = sorted.slice(0, n).map((msg) => ({
    source: msg.source,
    convId: msg.convId,
    msgIdx: msg.msgIdx,
    compound: msg.compound,
    contentPreview: msg.contentPreview,
    tokensInput: msg.tokensInput,
    tokensOutput: msg.tokensOutput,
  }));

  const worst = sorted
    .slice(-n)
    .reverse()
    .map((msg) => ({
      source: msg.source,
      convId: msg.convId,
      msgIdx: msg.msgIdx,
      compound: msg.compound,
      contentPreview: msg.contentPreview,
      tokensInput: msg.tokensInput,
      tokensOutput: msg.tokensOutput,
    }));

  return { best, worst };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function run(): void {
  const { values } = parseArgs({
    options: {
      date: { type: "string", short: "d" },
      sources: { type: "string", short: "s" },
      output: { type: "string", short: "o" },
      help: { type: "boolean", short: "h" },
    },
    strict: false,
  });

  /* ---- help ---- */
  if (values.help) {
    printUsage();
    process.exit(0);
  }

  /* ---- date ---- */
  const date = (values.date ?? today()) as string;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error(`Error: invalid date format "${date}". Expected YYYY-MM-DD.`);
    process.exit(1);
  }
  // Semantic date validation
  const parsed = new Date(date + "T00:00:00Z");
  const utcMonth = parsed.getUTCMonth() + 1;
  const utcDay = parsed.getUTCDate();
  const [y, m, d] = date.split("-").map(Number);
  if (utcMonth !== m || utcDay !== d) {
    console.error(`Error: invalid date "${date}". Month must be 01-12, day must be valid for the month.`);
    process.exit(1);
  }

  /* ---- resolve sources ---- */
  let sources: string[];
  if (values.sources) {
    sources = (values.sources as string)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } else {
    sources = detectSources();
  }

  if (sources.length === 0) {
    console.log("No AI CLIs found on this system.");
    process.exit(1);
  }

  console.log(`Agent Diary — ${date}\n`);
  console.log(`Sources: ${sources.join(", ")}`);

  /* ---- parse each source (one failure should not break the rest) ---- */
  const parserMap: Record<string, (dateStr: string) => Conversation[]> = {
    hermes: parseHermes,
    pi: parsePi,
    claude: parseClaude,
    opencode: parseOpencode,
  };

  const allConversations: Conversation[] = [];

  for (const source of sources) {
    const parser = parserMap[source];
    if (!parser) {
      console.warn(`  ⚠ Unknown source "${source}", skipping.`);
      continue;
    }
    try {
      const conversations = parser(date);
      allConversations.push(...conversations);
      console.log(`  ✓ ${source}: ${conversations.length} session(s)`);
    } catch (err) {
      console.warn(`  ⚠ Failed to parse "${source}": ${err}`);
    }
  }

  /* ---- sort by startedAt ---- */
  allConversations.sort((a, b) => {
    const ta = a.startedAt?.getTime() ?? 0;
    const tb = b.startedAt?.getTime() ?? 0;
    return ta - tb;
  });

  /* ---- none found ---- */
  if (allConversations.length === 0) {
    console.log(`\nNo sessions found for ${date}.`);
    process.exit(0);
  }

  /* ---- run analyzers ---- */
  console.log(`\nAnalyzing ${allConversations.length} session(s)…`);
  const sentiment = analyzeSentiment(allConversations);
  const tone = analyzeTone(allConversations);
  const interaction = analyzeInteraction(allConversations);

  /* ---- derived metrics ---- */
  const effectiveness = computeEffectivenessIndex(sentiment, tone, interaction);
  const sourcesData = computeSourceMetrics(allConversations, sentiment);
  const notable = computeNotableChats(sentiment, 5);

  /* ---- build full result ---- */
  const result: AnalysisResult = {
    sentiment,
    tone,
    interaction,
    effectiveness,
    sourcesData,
    notable,
    conversations: allConversations,
  };

  /* ---- render report ---- */
  const outputPath = values.output
    ? (values.output as string)
    : path.join("output", `diary-${date}.html`);

  renderReport(date, result, outputPath);
  console.log(`\n✔ Report written to ${outputPath}`);

  /* ---- console summary ---- */
  const sourceNames = Object.keys(sourcesData).join(", ");
  console.log(`\n── Summary for ${date} ──`);
  console.log(`  Sources:          ${sourceNames}`);
  console.log(`  Sessions:         ${interaction.totalSessions}`);
  console.log(`  Messages:         ${interaction.totalTurns}`);
  console.log(`  Overall Tone:     ${sentiment.dominantTone} (${sentiment.overallCompound.toFixed(3)})`);
  console.log(`  Effectiveness:    ${effectiveness.score}/100 (${effectiveness.label})`);
  console.log(`  Clean Exit Rate:  ${(interaction.cleanExitRatio * 100).toFixed(0)}%`);
  console.log(`  Report:           ${outputPath}`);
}
