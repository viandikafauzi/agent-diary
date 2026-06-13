import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Session, Message } from "../types.js";

function findJsonlFiles(dir: string): string[] {
  const results: string[] = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findJsonlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      results.push(fullPath);
    }
  }

  return results;
}

function parseTimestamp(ts: unknown): Date | null {
  if (!ts) return null;
  if (typeof ts === "number") {
    const d = new Date(ts > 1e12 ? ts : ts * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof ts === "string") {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function parsePi(dateStr: string): Session[] {
  try {
    const startTimestamp = new Date(dateStr + "T00:00:00").getTime();
    const endTimestamp = new Date(dateStr + "T23:59:59").getTime();
    if (isNaN(startTimestamp) || isNaN(endTimestamp)) return [];

    const sessionsDir = path.join(os.homedir(), ".pi", "agent", "sessions");
    if (!fs.existsSync(sessionsDir)) return [];

    const jsonlFiles = findJsonlFiles(sessionsDir).sort();
    if (jsonlFiles.length === 0) return [];

    const sessions: Session[] = [];

    for (const filePath of jsonlFiles) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n").filter((line) => line.trim());

        let sessionId = "";
        let sessionTitle: string | null = null;
        let sessionCwd: string | null = null;
        let sessionTimestamp: Date | null = null;
        let model: string | null = null;
        const events: Record<string, unknown>[] = [];

        for (const line of lines) {
          try {
            const obj = JSON.parse(line) as Record<string, unknown>;
            const type = obj.type as string;

            if (type === "session") {
              sessionId = (obj.id as string) ?? "";
              sessionTitle = (obj.title as string) ?? null;
              sessionCwd = (obj.cwd as string) ?? null;
              sessionTimestamp = parseTimestamp(obj.timestamp);
            } else if (type === "model_change") {
              model = (obj.modelId as string) ?? (obj.model as string) ?? model;
            } else if (type === "message") {
              events.push(obj);
            }
          } catch {
            // skip invalid JSON lines
          }
        }

        if (!sessionTimestamp || events.length === 0) continue;

        const sessionTime = sessionTimestamp.getTime();
        if (sessionTime < startTimestamp || sessionTime > endTimestamp) continue;

        const messages: Message[] = [];
        let tokensInput = 0;
        let tokensOutput = 0;
        let lastCacheRead = 0;
        let toolCallCount = 0;
        let sessionCost = 0;

        for (const event of events) {
          const msg = event.message as Record<string, unknown> | undefined;
          if (!msg) continue;

          const role = (msg.role as string) ?? "unknown";

          let content = "";
          const contentBlocks = msg.content as
            | Array<Record<string, unknown>>
            | undefined;
          const toolCalls: Record<string, unknown>[] = [];

          if (typeof msg.content === "string") {
            content = msg.content;
          } else if (Array.isArray(contentBlocks)) {
            for (const block of contentBlocks) {
              if (
                block.type === "text" &&
                typeof block.text === "string"
              ) {
                content += (content ? "\n" : "") + block.text;
              } else if (
                block.type === "thinking" &&
                typeof block.thinking === "string"
              ) {
                content += (content ? "\n" : "") + block.thinking;
              } else if (block.type === "toolCall") {
                toolCalls.push({
                  id: block.id,
                  name: block.name,
                  arguments: block.arguments,
                });
                toolCallCount++;
              }
            }
          }

          const timestamp = parseTimestamp(msg.timestamp);

          const usage = msg.usage as Record<string, unknown> | undefined;
          const msgInput = (usage?.input as number) ?? 0;
          const msgOutput = (usage?.output as number) ?? 0;
          const msgCacheRead = (usage?.cacheRead as number) ?? 0;
          // cacheRead is cumulative (total cached context), use last message's value
          // input is new (non-cached) tokens for this message, sum them all
          tokensInput += msgInput;
          tokensOutput += msgOutput;
          // Track cumulative cache read from last message
          lastCacheRead = msgCacheRead;
          
          // Extract cost from usage.cost.total if available
          const costObj = usage?.cost as Record<string, unknown> | undefined;
          if (costObj && typeof costObj.total === 'number') {
            sessionCost += costObj.total;
          }

          messages.push({
            role,
            content,
            timestamp,
            toolCalls,
            toolName:
              toolCalls.length > 0
                ? (toolCalls[0].name as string) ?? null
                : null,
            finishReason: null,
            model,
            tokenCount: (msgInput + msgOutput) || null,
          });
        }

        // Total input = non-cached input + final cached context size
        const totalInput = tokensInput + lastCacheRead;

        if (!sessionTitle) {
          const firstUserMsg = messages.find((m) => m.role === "user");
          if (firstUserMsg) {
            sessionTitle =
              firstUserMsg.content.split("\n")[0].slice(0, 80) || null;
          }
          if (!sessionTitle && sessionCwd) {
            sessionTitle = path.basename(sessionCwd) || null;
          }
        }

        sessions.push({
          id: sessionId || path.basename(filePath, ".jsonl"),
          title: sessionTitle,
          source: "pi",
          model,
          startedAt: sessionTimestamp,
          endedAt:
            messages.length > 0
              ? messages[messages.length - 1].timestamp
              : null,
          messages,
          messageCount: messages.length,
          toolCallCount,
          estimatedCostUsd: sessionCost,
          totalTokens: totalInput + tokensOutput,
          tokensInput: totalInput,
          tokensOutput,
        });
      } catch {
        // skip files that fail to parse
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
