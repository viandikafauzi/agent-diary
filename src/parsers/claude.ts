import fs from "node:fs";
import path from "node:path";
import type { Session, Message } from "../types.js";
import { claudeProjectsDir, claudeDesktopSessionsDir } from "../paths.js";

interface ClaudeLine {
  type: string;
  timestamp: string;
  title?: string;
  customTitle?: string;
  cwd?: string;
  isMeta?: boolean;
  costUSD?: number;
  message?: ClaudeMessage;
}

interface ClaudeMessage {
  model?: string;
  content?: string | ClaudeContentBlock[];
  usage?: { iterations?: ClaudeIteration[] };
  stop_reason?: string;
}

interface ClaudeContentBlock {
  type: string;
  text?: string;
  content?: string | { type: string; text: string }[];
  tool_use_id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface ClaudeIteration {
  input_tokens: number;
  output_tokens: number;
}

interface SessionIndexEntry {
  sessionId: string;
  timestamp: string;
  fullPath: string;
}

export function parseClaude(dateStr: string): Session[] {
  try {
    const startTimestamp = new Date(dateStr + "T00:00:00").getTime();
    const endTimestamp = new Date(dateStr + "T23:59:59").getTime();
    if (isNaN(startTimestamp) || isNaN(endTimestamp)) return [];

    const sessions: Session[] = [];

    // ── Source 1: Claude Code CLI ( ~/.claude/projects/ ) ────────────
    const projectsDir = claudeProjectsDir();
    if (fs.existsSync(projectsDir)) {
      const projectDirs = readSubdirs(projectsDir);
      for (const projDir of projectDirs) {
        parseAllInDir(projDir, startTimestamp, endTimestamp, sessions);
      }
    }

    // ── Source 2: Claude Desktop local-agent sessions ────────────────
    const desktopDir = claudeDesktopSessionsDir();
    if (desktopDir && fs.existsSync(desktopDir)) {
      const sessionDirs = findDesktopSessionDirs(desktopDir);
      for (const sessionPath of sessionDirs) {
        parseAllInDir(sessionPath, startTimestamp, endTimestamp, sessions);
      }
    }

    sessions.sort((a, b) => {
      const ta = a.startedAt?.getTime() ?? 0;
      const tb = b.startedAt?.getTime() ?? 0;
      return tb - ta;
    });

    return sessions;
  } catch {
    return [];
  }
}

/**
 * Walk a single project / output directory, find all matching JSONL files
 * and parse them into sessions.
 */
function parseAllInDir(
  dir: string,
  startMs: number,
  endMs: number,
  acc: Session[],
): void {
  const matchingSessions = findMatchingSessions(dir, startMs, endMs);
  for (const sessionEntry of matchingSessions) {
    try {
      const sess = parseSessionFile(sessionEntry);
      if (sess) acc.push(sess);
    } catch {
      // skip unparseable sessions
    }
  }
}

/**
 * Walk the Claude Desktop session tree and collect all
 * `.claude/projects/<name>/` directories that contain JSONL files.
 *
 * Directory layout:
 *   local-agent-mode-sessions/{org}/{workspace}/local_{uuid}/
 *     .claude/projects/{project_name}/
 *       {session_id}.jsonl
 */
function findDesktopSessionDirs(root: string): string[] {
  const result: string[] = [];
  try {
    const orgDirs = readSubdirs(root);
    for (const orgDir of orgDirs) {
      const workspaceDirs = readSubdirs(orgDir);
      for (const wsDir of workspaceDirs) {
        const localDirs = readSubdirs(wsDir);
        for (const localDir of localDirs) {
          const projectsPath = path.join(localDir, ".claude", "projects");
          if (!fs.existsSync(projectsPath)) continue;
          const projectDirs = readSubdirs(projectsPath);
          result.push(...projectDirs);
        }
      }
    }
  } catch {
    // ignore inaccessible directories
  }
  return result;
}

function readSubdirs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

function findMatchingSessions(
  projDir: string,
  startMs: number,
  endMs: number,
): string[] {
  const index = tryLoadIndex(projDir);

  if (index) {
    return index
      .filter((e) => {
        const ts = new Date(e.timestamp).getTime();
        return ts >= startMs && ts <= endMs;
      })
      .map((e) => e.fullPath);
  }

  return findMatchingJsonlFiles(projDir, startMs, endMs);
}

function tryLoadIndex(projDir: string): SessionIndexEntry[] | null {
  const indexPath = path.join(projDir, "sessions-index.json");
  try {
    if (!fs.existsSync(indexPath)) return null;
    const raw = fs.readFileSync(indexPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as SessionIndexEntry[];
    return null;
  } catch {
    return null;
  }
}

function findMatchingJsonlFiles(
  projDir: string,
  startMs: number,
  endMs: number,
): string[] {
  const results: string[] = [];
  let entries;
  try {
    entries = fs.readdirSync(projDir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
    const filePath = path.join(projDir, entry.name);
    try {
      const firstLine = readFirstLineWithTimestamp(filePath);
      if (!firstLine) continue;
      const obj = JSON.parse(firstLine) as ClaudeLine;
      const ts = obj.timestamp ? new Date(obj.timestamp).getTime() : NaN;
      if (!isNaN(ts) && ts >= startMs && ts <= endMs) {
        results.push(filePath);
      }
    } catch {
      // skip unreadable files
    }
  }

  return results;
}

function readFirstLineWithTimestamp(filePath: string): string | null {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(8192);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const content = buf.toString("utf-8", 0, bytesRead);
    const lines = content.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.timestamp) return line;
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function parseSessionFile(filePath: string): Session | null {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());

  const parsedLines: ClaudeLine[] = [];
  let sessionTitle: string | null = null;
  let sessionCwd: string | null = null;
  let firstTimestamp: Date | null = null;
  let firstModel: string | null = null;
  let totalCost = 0;
  const seenIterations = new Set<string>();
  let totalInput = 0;
  let totalOutput = 0;

  for (const line of lines) {
    let obj: ClaudeLine;
    try {
      obj = JSON.parse(line) as ClaudeLine;
    } catch {
      continue;
    }

    parsedLines.push(obj);

    if (obj.type === "session") {
      sessionTitle = obj.title ?? null;
    } else if (obj.type === "custom-title" && obj.customTitle) {
      sessionTitle = obj.customTitle;
    } else if (obj.type === "ai-title" && obj.title) {
      sessionTitle = obj.title;
    }

    if (!sessionCwd && obj.cwd) {
      sessionCwd = obj.cwd;
    }

    if (!firstTimestamp && obj.timestamp) {
      const d = new Date(obj.timestamp);
      if (!isNaN(d.getTime())) firstTimestamp = d;
    }

    if (obj.costUSD) totalCost += obj.costUSD;

    if (obj.message) {
      if (obj.message.model && !firstModel) firstModel = obj.message.model;

      const iterations = obj.message.usage?.iterations;
      if (iterations) {
        for (const iter of iterations) {
          const key = `${iter.input_tokens}:${iter.output_tokens}`;
          if (!seenIterations.has(key)) {
            seenIterations.add(key);
            totalInput += iter.input_tokens;
            totalOutput += iter.output_tokens;
          }
        }
      }
    }
  }

  const messages = buildMessages(parsedLines, firstModel);

  if (messages.length === 0) return null;

  if (!sessionTitle) {
    const firstUserLine = parsedLines.find(
      (l) => l.type === "user" && !l.isMeta && l.message?.content,
    );
    if (firstUserLine?.message) {
      const msg = firstUserLine.message;
      const raw =
        typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
            ? (msg.content.find((b) => b.type === "text")?.text ?? "")
            : "";
      sessionTitle = raw.split("\n")[0].slice(0, 80) || null;
    }
    if (!sessionTitle && sessionCwd) {
      sessionTitle = path.basename(sessionCwd) || null;
    }
  }

  const sessionId = path.basename(filePath, ".jsonl");
  let toolCallCount = 0;
  for (const msg of messages) {
    toolCallCount += msg.toolCalls.length;
  }

  return {
    id: sessionId,
    title: sessionTitle,
    source: "claude",
    model: firstModel,
    startedAt: firstTimestamp,
    endedAt: messages[messages.length - 1].timestamp,
    messages,
    messageCount: messages.length,
    toolCallCount,
    estimatedCostUsd: totalCost,
    totalTokens: totalInput + totalOutput,
    tokensInput: totalInput,
    tokensOutput: totalOutput,
  };
}

function buildMessages(
  lines: ClaudeLine[],
  model: string | null,
): Message[] {
  const messages: Message[] = [];

  for (const obj of lines) {
    if (!obj.message) continue;

    const type = obj.type;
    const msg = obj.message;

    if (type === "user") {
      const { content, isToolResult } = extractUserContent(msg);
      messages.push({
        role: isToolResult ? "toolResult" : "user",
        content,
        timestamp: parseTimestamp(obj.timestamp),
        toolCalls: [],
        toolName: null,
        finishReason: null,
        model,
        tokenCount: null,
      });
    } else if (type === "assistant") {
      const { content, toolCalls, toolName } = extractAssistantContent(msg);
      messages.push({
        role: "assistant",
        content,
        timestamp: parseTimestamp(obj.timestamp),
        toolCalls,
        toolName,
        finishReason: msg.stop_reason ?? null,
        model: msg.model ?? model,
        tokenCount: null,
      });
    }
  }

  return messages;
}

function extractUserContent(msg: ClaudeMessage): { content: string; isToolResult: boolean } {
  if (typeof msg.content === "string") return { content: msg.content, isToolResult: false };

  if (Array.isArray(msg.content)) {
    const parts: string[] = [];
    let hasToolResult = false;
    let hasText = false;
    for (const block of msg.content) {
      if (block.type === "text" && typeof block.text === "string") {
        parts.push(block.text);
        hasText = true;
      } else if (block.type === "tool_result") {
        const resultText = extractToolResultText(block);
        if (resultText) parts.push(resultText);
        hasToolResult = true;
      }
    }
    // Mark as toolResult if it only contains tool results (no user text)
    return { content: parts.join("\n"), isToolResult: hasToolResult && !hasText };
  }

  return { content: "", isToolResult: false };
}

function extractToolResultText(block: ClaudeContentBlock): string {
  if (typeof block.content === "string") return block.content;
  if (Array.isArray(block.content)) {
    return block.content
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text!)
      .join("\n");
  }
  return "";
}

function extractAssistantContent(msg: ClaudeMessage): {
  content: string;
  toolCalls: Record<string, unknown>[];
  toolName: string | null;
} {
  const textParts: string[] = [];
  const toolCalls: Record<string, unknown>[] = [];

  if (typeof msg.content === "string") {
    textParts.push(msg.content);
  } else if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (block.type === "text" && typeof block.text === "string") {
        textParts.push(block.text);
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.tool_use_id,
          name: block.name,
          input: block.input,
        });
      }
    }
  }

  return {
    content: textParts.join("\n"),
    toolCalls,
    toolName: toolCalls.length > 0 ? (toolCalls[0].name as string) ?? null : null,
  };
}

function parseTimestamp(ts: string | undefined): Date | null {
  if (!ts) return null;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}
