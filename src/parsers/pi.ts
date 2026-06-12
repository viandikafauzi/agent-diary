import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Conversation, Message } from "../types.js";

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

export function parsePi(dateStr: string): Conversation[] {
  try {
    const startTimestamp = Date.parse(dateStr + "T00:00:00Z");
    const endTimestamp = Date.parse(dateStr + "T23:59:59Z");
    if (isNaN(startTimestamp) || isNaN(endTimestamp)) return [];

    const sessionsDir = path.join(os.homedir(), ".pi", "agent", "sessions");
    if (!fs.existsSync(sessionsDir)) return [];

    const jsonlFiles = findJsonlFiles(sessionsDir).sort();
    if (jsonlFiles.length === 0) return [];

    const conversations: Conversation[] = [];

    for (const filePath of jsonlFiles) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n").filter((line) => line.trim());

        let sessionId = "";
        let sessionTimestamp: Date | null = null;
        let model: string | null = null;
        const events: Record<string, unknown>[] = [];

        for (const line of lines) {
          try {
            const obj = JSON.parse(line) as Record<string, unknown>;
            const type = obj.type as string;

            if (type === "session") {
              sessionId = (obj.id as string) ?? "";
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
        let totalTokens = 0;
        let tokensInput = 0;
        let tokensOutput = 0;
        let toolCallCount = 0;

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
          totalTokens +=
            (usage?.totalTokens as number) ?? (msgInput + msgOutput);
          tokensInput += msgInput;
          tokensOutput += msgOutput;

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
            tokenCount: ((usage?.totalTokens as number) ?? (msgInput + msgOutput)) || null,
          });
        }

        conversations.push({
          id: sessionId || path.basename(filePath, ".jsonl"),
          source: "pi",
          model,
          startedAt: sessionTimestamp,
          endedAt:
            messages.length > 0
              ? messages[messages.length - 1].timestamp
              : null,
          endReason: null,
          messages,
          messageCount: messages.length,
          toolCallCount,
          estimatedCostUsd: 0,
          totalTokens,
          tokensInput,
          tokensOutput,
        });
      } catch {
        // skip files that fail to parse
      }
    }

    conversations.sort((a, b) => {
      const ta = a.startedAt?.getTime() ?? 0;
      const tb = b.startedAt?.getTime() ?? 0;
      return ta - tb;
    });

    return conversations;
  } catch {
    return [];
  }
}
