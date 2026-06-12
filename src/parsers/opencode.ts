import Database from "better-sqlite3";
import fs from "node:fs";
import type { Session, Message } from "../types.js";
import { opencodeDbPath } from "../paths.js";

export function parseOpencode(dateStr: string): Session[] {
  try {
    const startTimestamp = Date.parse(dateStr + "T00:00:00Z");
    const endTimestamp = Date.parse(dateStr + "T23:59:59Z");
    if (isNaN(startTimestamp) || isNaN(endTimestamp)) return [];

    const dbPath = opencodeDbPath();
    if (!fs.existsSync(dbPath)) return [];

    const db = new Database(dbPath, { readonly: true });

    const dbSessions = db
      .prepare(
        `SELECT * FROM session WHERE time_created >= ? AND time_created <= ? ORDER BY time_created DESC`,
      )
      .all(startTimestamp, endTimestamp) as Array<Record<string, unknown>>;

    const getMessages = db.prepare(
      `SELECT * FROM message WHERE session_id = ? ORDER BY time_created ASC`,
    );

    const getParts = db.prepare(
      `SELECT * FROM part WHERE message_id = ? ORDER BY rowid ASC`,
    );

    const sessions: Session[] = [];

    for (const session of dbSessions) {
      const messageRows = getMessages.all(session.id) as Array<
        Record<string, unknown>
      >;

      const messages: Message[] = [];
      let toolCallCount = 0;
      let lastModel: string | null = null;

      for (const msg of messageRows) {
        let msgData: Record<string, unknown> = {};
        try {
          msgData = JSON.parse((msg.data as string) ?? "{}");
        } catch {
          // invalid JSON — skip message-level parsing
        }

        const role = msgData.role as string | undefined;
        if (!role) continue;

        const parts = getParts.all(msg.id) as Array<Record<string, unknown>>;
        const timestamp = msg.time_created
          ? new Date(msg.time_created as number)
          : null;

        if (role === "user") {
          const contentParts: string[] = [];
          let hasToolResult = false;
          let hasUserText = false;
          for (const part of parts) {
            let partData: Record<string, unknown> = {};
            try {
              partData = JSON.parse((part.data as string) ?? "{}");
            } catch {
              continue;
            }

            if (partData.type === "text" && !partData.synthetic) {
              contentParts.push((partData.text as string) ?? "");
              hasUserText = true;
            } else if (partData.type === "tool-result" && partData.text) {
              contentParts.push((partData.text as string) ?? "");
              hasToolResult = true;
            }
          }

          // Mark as toolResult if it only contains tool results (no user text)
          messages.push({
            role: hasToolResult && !hasUserText ? "toolResult" : "user",
            content: contentParts.join("\n"),
            timestamp,
            toolCalls: [],
            toolName: null,
            finishReason: null,
            model: lastModel,
            tokenCount: null,
          });
        } else if (role === "assistant") {
          const toolCalls: Record<string, unknown>[] = [];
          const contentParts: string[] = [];
          let finishReason: string | null = null;

          for (const part of parts) {
            let partData: Record<string, unknown> = {};
            try {
              partData = JSON.parse((part.data as string) ?? "{}");
            } catch {
              continue;
            }

            const partType = partData.type as string;

            if (
              partType === "text" &&
              typeof partData.text === "string" &&
              !partData.synthetic
            ) {
              contentParts.push(partData.text);
            } else if (
              partType === "reasoning" &&
              typeof partData.text === "string"
            ) {
              contentParts.push(partData.text);
            } else if (partType === "tool") {
              // Each tool part is a single tool call
              const state = partData.state as Record<string, unknown> | undefined;
              toolCalls.push({
                id: partData.callID,
                name: partData.tool,
                input: state?.input,
              });
            } else if (partType === "step-finish") {
              finishReason =
                (partData.finishReason as string) ??
                (partData.reason as string) ??
                null;
            }
          }

          if (msgData.model) {
            if (typeof msgData.model === "string") {
              lastModel = msgData.model;
            } else if (typeof msgData.model === "object" && msgData.model !== null) {
              const m = msgData.model as Record<string, unknown>;
              lastModel =
                (m.modelID as string) ??
                (m.providerID && m.modelID
                  ? `${m.providerID}/${m.modelID}`
                  : lastModel);
            }
          }

          toolCallCount += toolCalls.length;

          messages.push({
            role: "assistant",
            content: contentParts.join("\n"),
            timestamp,
            toolCalls,
            toolName:
              toolCalls.length > 0
                ? (toolCalls[0].name as string) ?? null
                : null,
            finishReason,
            model: (typeof msgData.model === "string" ? msgData.model : null) ?? lastModel,
            tokenCount: null,
          });
        }
      }

      if (messages.length === 0) continue;

      let sessionModel: string | null = null;
      try {
        const modelData = JSON.parse((session.model as string) ?? "{}");
        sessionModel =
          (modelData.id as string) ??
          (modelData.providerID && modelData.variant
            ? `${modelData.providerID}/${modelData.variant}`
            : null) ??
          null;
      } catch {
        sessionModel = (session.model as string) ?? null;
      }

      const tokensInput = (session.tokens_input as number) || 0;
      const tokensOutput = (session.tokens_output as number) || 0;
      const tokensReasoning = (session.tokens_reasoning as number) || 0;
      const cost = (session.cost as number) || 0;

      sessions.push({
        id: session.id as string,
        source: "opencode",
        model: sessionModel,
        startedAt: session.time_created
          ? new Date(session.time_created as number)
          : null,
        endedAt: session.time_updated
          ? new Date(session.time_updated as number)
          : null,
        messages,
        messageCount: messages.length,
        toolCallCount,
        estimatedCostUsd: cost,
        totalTokens: tokensInput + tokensOutput + tokensReasoning,
        tokensInput,
        tokensOutput,
        tokensReasoning: tokensReasoning || undefined,
      });
    }

    db.close();
    return sessions;
  } catch {
    return [];
  }
}
