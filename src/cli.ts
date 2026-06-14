import fs from "node:fs";
import { exec, execSync } from "node:child_process";
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
import { computeEffectivenessIndex } from "./analyzers/effectiveness.js";
import { renderReport } from "./reporters/renderer.js";
import { resolveDateRange } from "./date-utils.js";
import type {
  DateRange,
  Session,
  AnalysisResult,
  SourceMetrics,
  SentimentResult,
  ToneResult,
  InteractionResult,
  EffectivenessIndex,
} from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage: npx agent-diary [options]

Options:
  -d, --date <YYYY-MM-DD>    Anchor date (default: today). Used with --range.
  -s, --sources <list>       Comma-separated sources: hermes,pi,claude,opencode
  -r, --range <value>        Date range mode. One of:
                               week          — 7 rolling days
                               month         — 30 rolling days
                               year          — 365 rolling days
                               <month-name>  — calendar month (e.g. June)
                               YYYY-MM       — specific calendar month
                               YYYY          — specific calendar year
  -o, --output <path>        Custom output HTML path
  -h, --help                 Show this help

Examples:
  npx agent-diary
  npx agent-diary --date 2026-06-12
  npx agent-diary --date 2026-06-12 --range week
  npx agent-diary --range June
  npx agent-diary --range 2026-05
  npx agent-diary --sources hermes,claude --output report.html
`);
}

/**
 * Aggregate per-source metrics (session count, message count, tool calls,
 * tokens, average tone) from the flattened sessions and sentiment data.
 */
function computeSourceMetrics(
  sessions: Session[],
  sentimentResult: SentimentResult,
): Record<string, SourceMetrics> {
  // Count unique sessions per source
  const perSource: Record<
    string,
    { sessions: Set<string>; messages: number; toolCalls: number; tokens: number; cost: number }
  > = {};

  for (const sess of sessions) {
    if (!perSource[sess.source]) {
      perSource[sess.source] = {
        sessions: new Set(),
        messages: 0,
        toolCalls: 0,
        tokens: 0,
        cost: 0,
      };
    }
    const entry = perSource[sess.source];
    entry.sessions.add(sess.id);
    entry.messages += sess.messageCount;
    entry.toolCalls += sess.toolCallCount;
    entry.tokens += sess.totalTokens;
    entry.cost += sess.estimatedCostUsd;
  }

  // Group per-session compounds by source for avg tone
  const compoundsBySource: Record<string, number[]> = {};
  for (const pc of sentimentResult.perSession) {
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
      cost: data.cost,
      avgTone,
    };
  }

  return metrics;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function run(): void {
  const { values } = parseArgs({
    options: {
      date: { type: "string", short: "d" },
      range: { type: "string", short: "r" },
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

  /* ---- date validation (only when --date is given) ---- */
  const rawDate = (values.date ?? undefined) as string | undefined;
  if (rawDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      console.error(`Error: invalid date format "${rawDate}". Expected YYYY-MM-DD.`);
      process.exit(1);
    }
    // Semantic date validation
    const parsed = new Date(rawDate + "T00:00:00Z");
    const utcMonth = parsed.getUTCMonth() + 1;
    const utcDay = parsed.getUTCDate();
    const [y, m, d] = rawDate.split("-").map(Number);
    if (utcMonth !== m || utcDay !== d) {
      console.error(`Error: invalid date "${rawDate}". Month must be 01-12, day must be valid for the month.`);
      process.exit(1);
    }
  }

  /* ---- resolve date range ---- */
  const rangeArg = (values.range ?? undefined) as string | undefined;
  let dateRange: DateRange;
  try {
    dateRange = resolveDateRange(rawDate, rangeArg);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
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

  console.log(`Agent Diary — ${dateRange.label}\n`);
  console.log(`Sources: ${sources.join(", ")}`);

  /* ---- parse each source (one failure should not break the rest) ---- */
  const parserMap: Record<string, (startMs: number, endMs: number) => Session[]> = {
    hermes: parseHermes,
    pi: parsePi,
    claude: parseClaude,
    opencode: parseOpencode,
  };

  const allSessions: Session[] = [];

  for (const source of sources) {
    const parser = parserMap[source];
    if (!parser) {
      console.warn(`  ⚠ Unknown source "${source}", skipping.`);
      continue;
    }
    try {
      const sessions = parser(dateRange.startMs, dateRange.endMs);
      allSessions.push(...sessions);
      console.log(`  ✓ ${source}: ${sessions.length} session(s)`);
    } catch (err) {
      console.warn(`  ⚠ Failed to parse "${source}": ${err}`);
    }
  }

  /* ---- sort by startedAt ---- */
  allSessions.sort((a, b) => {
    const ta = a.startedAt?.getTime() ?? 0;
    const tb = b.startedAt?.getTime() ?? 0;
    return tb - ta;
  });

  /* ---- none found ---- */
  if (allSessions.length === 0) {
    console.log(`\nNo sessions found for ${dateRange.label}.`);
    process.exit(0);
  }

  /* ---- run analyzers ---- */
  console.log(`\nAnalyzing ${allSessions.length} session(s)…`);
  const sentiment = analyzeSentiment(allSessions);
  const tone = analyzeTone(allSessions);
  const interaction = analyzeInteraction(allSessions);

  /* ---- derived metrics ---- */
  const effectiveness = computeEffectivenessIndex(sentiment, tone);
  const sourcesData = computeSourceMetrics(allSessions, sentiment);

  /* ---- per-source analysis ---- */
  const sessionsBySource: Record<string, Session[]> = {};
  for (const sess of allSessions) {
    if (!sessionsBySource[sess.source]) sessionsBySource[sess.source] = [];
    sessionsBySource[sess.source].push(sess);
  }

  const perSourceAnalysis: Record<string, { sentiment: SentimentResult; tone: ToneResult; interaction: InteractionResult; effectiveness: EffectivenessIndex }> = {};
  for (const source of sources) {
    const sourceSessions = sessionsBySource[source];
    if (!sourceSessions || sourceSessions.length === 0) continue;
    const srcSentiment = analyzeSentiment(sourceSessions);
    const srcTone = analyzeTone(sourceSessions);
    const srcInteraction = analyzeInteraction(sourceSessions);
    const srcEffectiveness = computeEffectivenessIndex(srcSentiment, srcTone);
    perSourceAnalysis[source] = {
      sentiment: srcSentiment,
      tone: srcTone,
      interaction: srcInteraction,
      effectiveness: srcEffectiveness,
    };
  }

  /* ---- build full result ---- */
  const result: AnalysisResult = {
    sentiment,
    tone,
    interaction,
    effectiveness,
    perSourceAnalysis,
    sourcesData,
    sessions: allSessions,
  };

  /* ---- render report ---- */
  const outputPath = values.output
    ? (values.output as string)
    : dateRange.rangeArg
      ? `diary-range-${dateRange.rangeArg}.html`
      : `diary-${rawDate ?? new Date().toISOString().slice(0, 10)}.html`;

  renderReport(dateRange.label, result, outputPath);
  console.log(`\n✔ Report written to ${outputPath}`);

  /* ---- open in browser ---- */
  openInBrowser(outputPath);

  /* ---- console summary ---- */
  const sourceNames = Object.keys(sourcesData).join(", ");
  console.log(`\n── Summary for ${dateRange.label} ──`);
  console.log(`  Sources:          ${sourceNames}`);
  console.log(`  Sessions:         ${interaction.totalSessions}`);
  console.log(`  Messages:         ${interaction.totalTurns}`);
  console.log(`  Overall Tone:     ${sentiment.dominantTone} (${sentiment.overallCompound.toFixed(3)})`);
  console.log(`  Effectiveness:    ${(effectiveness.score / 100).toFixed(2)} (${effectiveness.label})`);
  console.log(`  Report:           ${outputPath}`);
}

/**
 * Detect if running inside Windows Subsystem for Linux (WSL).
 */
function isWsl(): boolean {
  if (process.platform !== "linux") return false;
  try {
    const version = fs.readFileSync("/proc/version", "utf-8").toLowerCase();
    return version.includes("microsoft") || version.includes("wsl");
  } catch {
    return false;
  }
}

/**
 * Check if a command exists (is available in PATH).
 */
function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore", timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Open a file in the user's default browser, cross-platform.
 */
function openInBrowser(filePath: string): void {
  const resolved = path.resolve(filePath);
  const platform = process.platform;

  let command: string;
  if (platform === "win32") {
    command = `cmd /c start "" "${resolved}"`;
  } else if (platform === "darwin") {
    command = `open "${resolved}"`;
  } else if (isWsl()) {
    // WSL: try wslview first (from wslu package), then PowerShell with file:// URL
    if (commandExists("wslview")) {
      command = `wslview "${resolved}"`;
    } else {
      // Convert Linux path to file:// URL for WSL UNC path
      const fileUrl = `file://wsl.localhost/Ubuntu${resolved}`;
      command = `powershell.exe -Command "Start-Process '${fileUrl}'"`;
    }
  } else {
    command = `xdg-open "${resolved}"`;
  }

  exec(command, (err) => {
    if (err) {
      console.warn(`  \u26a0 Could not open browser: ${err.message}`);
    }
  });
}
