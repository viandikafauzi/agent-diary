import Database from "better-sqlite3";
import fs from "node:fs";
import type { Session, Message } from "../types.js";
import { hermesStateDbPath } from "../paths.js";

// Approximate model pricing per 1M tokens (USD) for common Hermes models.
// When Hermes itself doesn't store estimated cost (cost_status = 'unknown'),
// we compute it from input/output token counts using these rates.
// Sources: official pricing pages for each provider.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // DeepSeek (specific first, then broader catch-all)
  "deepseek-chat": { input: 0.27, output: 1.10 },
  "deepseek-v3": { input: 0.27, output: 1.10 },
  "deepseek-reasoner": { input: 0.55, output: 2.19 },
  "deepseek-r1": { input: 0.55, output: 2.19 },
  "deepseek": { input: 0.27, output: 1.10 },  // catch-all for deepseek-* variants
  // GPT-4 family
  "gpt-4o": { input: 2.50, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-4": { input: 30, output: 60 },
  // Claude family (also used via Hermes pass-through)
  "claude-3-5-sonnet": { input: 3, output: 15 },
  "claude-3-5-haiku": { input: 0.80, output: 4 },
  "claude-3-opus": { input: 15, output: 75 },
  "claude-3-sonnet": { input: 3, output: 15 },
  "claude-3-haiku": { input: 0.25, output: 1.25 },
  "claude-4-sonnet": { input: 3, output: 15 },
  "claude-4-opus": { input: 15, output: 75 },
  // Gemini
  "gemini-2.0-flash": { input: 0.10, output: 0.40 },
  "gemini-2.5-flash": { input: 0.15, output: 0.60 },
  "gemini-2.5-pro": { input: 1.25, output: 5 },
  // Groq / Llama
  "llama-3": { input: 0.59, output: 0.79 },
  "llama-4": { input: 0.59, output: 0.79 },
  "mixtral": { input: 0.59, output: 0.79 },
};

// Default fallback pricing when model is unknown
const DEFAULT_PRICING = { input: 0.50, output: 1.50 };

/**
 * Estimate cost in USD from model name and token counts.
 * Uses per-1M-token pricing scaled down appropriately.
 */
function estimateCost(
  model: string | null,
  inputTokens: number,
  outputTokens: number,
): number {
  let pricing = DEFAULT_PRICING;
  if (model) {
    const lower = model.toLowerCase();
    for (const [key, value] of Object.entries(MODEL_PRICING)) {
      if (lower.includes(key)) {
        pricing = value;
        break;
      }
    }
  }
  // price per token = price per 1M / 1_000_000
  return (
    (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
  );
}

/**
 * Parse Hermes sessions within a millisecond-precision time window.
 *
 * @param startMs  Start of the window (inclusive, epoch ms)
 * @param endMs    End of the window (inclusive, epoch ms)
 */
export function parseHermes(startMs: number, endMs: number): Session[] {
  try {
    // Hermes stores timestamps in seconds
    const startTimestamp = Math.floor(startMs / 1000);
    const endTimestamp = Math.ceil(endMs / 1000);

    const dbPath = hermesStateDbPath();
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
        title: (session.title as string) ?? null,
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
        estimatedCostUsd:
          (session.estimated_cost_usd as number) ||
          estimateCost(
            session.model as string | null,
            (session.input_tokens as number) || 0,
            (session.output_tokens as number) || 0,
          ),
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
