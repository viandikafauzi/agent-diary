import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Session, Message } from "../types.js";

export function parseHermes(dateStr: string): Session[] {
  try {
    const startTimestamp = Date.parse(dateStr + "T00:00:00Z") / 1000;
    const endTimestamp = Date.parse(dateStr + "T23:59:59Z") / 1000;

    const dbPath = path.join(os.homedir(), ".hermes", "state.db");
    if (!fs.existsSync(dbPath)) return [];

    const db = new Database(dbPath, { readonly: true });

    const dbSessions = db
      .prepare(
        `SELECT * FROM sessions WHERE started_at >= ? AND started_at <= ? ORDER BY started_at DESC`,
      )
      .all(startTimestamp, endTimestamp) as Array<Record<string, unknown>>;

    const getMessages = db.prepare(
      `SELECT * FROM messages WHERE session_id = ? AND active = 1 ORDER BY timestamp ASC`,
    );

    const sessions: Session[] = [];

    for (const session of dbSessions) {
      const rows = getMessages.all(session.id) as Array<Record<string, unknown>>;

      let toolCallsFromMessages = 0;
      const messages: Message[] = rows.map((msg) => {
        let toolCalls: Record<string, unknown>[] = [];
        try {
          const parsed = JSON.parse((msg.tool_calls as string) ?? "[]");
          if (Array.isArray(parsed)) toolCalls = parsed;
        } catch {
          // invalid JSON — leave as empty array
        }

        if (msg.role === "tool") toolCallsFromMessages++;

        return {
          role: msg.role as string,
          content: (msg.content as string) ?? "",
          timestamp: msg.timestamp
            ? new Date((msg.timestamp as number) * 1000)
            : null,
          toolCalls,
          toolName: (msg.tool_name as string) ?? null,
          finishReason: (msg.finish_reason as string) ?? null,
          model: (session.model as string) ?? null,
          tokenCount: (msg.token_count as number) ?? null,
        };
      });

      sessions.push({
        id: session.id as string,
        source: "hermes",
        model: session.model as string | null,
        startedAt: new Date((session.started_at as number) * 1000),
        endedAt: session.ended_at
          ? new Date((session.ended_at as number) * 1000)
          : null,
        messages,
        messageCount: messages.length,
        toolCallCount: Math.max(
          (session.tool_call_count as number) || 0,
          toolCallsFromMessages,
        ),
        estimatedCostUsd: (session.estimated_cost_usd as number) || 0,
        totalTokens:
          ((session.input_tokens as number) || 0) +
          ((session.output_tokens as number) || 0),
        tokensInput: (session.input_tokens as number) || 0,
        tokensOutput: (session.output_tokens as number) || 0,
        tokensReasoning: (session.reasoning_tokens as number) || 0,
      });
    }

    db.close();
    return sessions;
  } catch {
    return [];
  }
}
