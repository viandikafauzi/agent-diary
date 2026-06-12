import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Session, Message } from "../types.js";

interface ClaudeLine {
  type: string;
  timestamp: string;
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
    const startTimestamp = Date.parse(dateStr + "T00:00:00Z");
    const endTimestamp = Date.parse(dateStr + "T23:59:59Z");
    if (isNaN(startTimestamp) || isNaN(endTimestamp)) return [];

    const projectsDir = path.join(os.homedir(), ".claude", "projects");
    if (!fs.existsSync(projectsDir)) return [];

    const projectDirs = readSubdirs(projectsDir);
    const sessions: Session[] = [];

    for (const projDir of projectDirs) {
      const matchingSessions = findMatchingSessions(projDir, startTimestamp, endTimestamp);

      for (const sessionEntry of matchingSessions) {
        try {
          const sess = parseSessionFile(sessionEntry);
          if (sess) sessions.push(sess);
        } catch {
          // skip unparseable sessions
        }
      }
    }

    sessions.sort((a, b) => {
      const ta = a.startedAt?.getTime() ?? 0;
      const tb = b.startedAt?.getTime() ?? 0;
      return ta - tb;
    });

    return sessions;
  } catch {
    return [];
  }
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
      const firstLine = readFirstLine(filePath);
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

function readFirstLine(filePath: string): string | null {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(4096);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const content = buf.toString("utf-8", 0, bytesRead);
    const newlineIdx = content.indexOf("\n");
    if (newlineIdx === -1) return content || null;
    return content.slice(0, newlineIdx);
  } catch {
    return null;
  }
}

function parseSessionFile(filePath: string): Session | null {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());

  const parsedLines: ClaudeLine[] = [];
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

  const sessionId = path.basename(filePath, ".jsonl");
  let toolCallCount = 0;
  for (const msg of messages) {
    toolCallCount += msg.toolCalls.length;
  }

  return {
    id: sessionId,
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
      const content = extractUserContent(msg);
      messages.push({
        role: "user",
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

function extractUserContent(msg: ClaudeMessage): string {
  if (typeof msg.content === "string") return msg.content;

  if (Array.isArray(msg.content)) {
    const parts: string[] = [];
    for (const block of msg.content) {
      if (block.type === "text" && typeof block.text === "string") {
        parts.push(block.text);
      } else if (block.type === "tool_result") {
        const resultText = extractToolResultText(block);
        if (resultText) parts.push(resultText);
      }
    }
    return parts.join("\n");
  }

  return "";
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
