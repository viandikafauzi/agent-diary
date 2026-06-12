import type { Session, InteractionResult } from "../types.js";
import {
  detectLanguage,
  getInteractionPatterns,
  matchInteractionPattern,
} from "../analyzers/lang_utils.js";

export function analyzeInteraction(sessions: Session[]): InteractionResult {
  const allContents: string[] = [];

  for (const sess of sessions) {
    for (const msg of sess.messages) {
      if (msg.content.length > 0) {
        allContents.push(msg.content);
      }
    }
  }

  const language = detectLanguage(allContents);
  const patterns = getInteractionPatterns(language);

  const totalSessions = sessions.length;

  let totalUserMessages = 0;
  let totalAssistantMessages = 0;
  let totalCorrections = 0;
  let totalClarifications = 0;
  let cleanExits = 0;

  for (const sess of sessions) {
    const messages = sess.messages;

    if (messages.length === 0) continue;

    for (const msg of messages) {
      if (msg.content.length === 0) continue;

      if (msg.role === "user") {
        totalUserMessages++;
        if (matchInteractionPattern(patterns, "correction", msg.content)) {
          totalCorrections++;
        }
        if (matchInteractionPattern(patterns, "clarification_question", msg.content)) {
          totalClarifications++;
        }
      } else if (msg.role === "assistant") {
        totalAssistantMessages++;
      }
    }

    const lastMsg = messages[messages.length - 1];
    const secondLastMsg = messages.length >= 2 ? messages[messages.length - 2] : null;

    if (lastMsg.role === "user" && matchInteractionPattern(patterns, "exit_positive", lastMsg.content)) {
      cleanExits++;
    } else if (
      lastMsg.role === "assistant" &&
      secondLastMsg &&
      secondLastMsg.role === "user" &&
      matchInteractionPattern(patterns, "exit_positive", secondLastMsg.content)
    ) {
      cleanExits++;
    }
  }

  const totalTurns = totalUserMessages + totalAssistantMessages;
  const danglingExits = totalSessions - cleanExits;

  if (totalSessions === 0) {
    return {
      language,
      totalSessions: 0,
      totalTurns: 0,
      avgTurnsPerSession: 0,
      totalClarifications: 0,
      clarificationRatio: 0,
      totalCorrections: 0,
      correctionRatio: 0,
      avgRedosPerSession: 0,
      cleanExits: 0,
      danglingExits: 0,
      cleanExitRatio: 0,
    };
  }

  const avgTurnsPerSession = totalTurns / totalSessions;
  const correctionRatio = totalTurns > 0 ? totalCorrections / totalTurns : 0;
  const clarificationRatio = totalTurns > 0 ? totalClarifications / totalTurns : 0;
  const cleanExitRatio = cleanExits / totalSessions;

  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  return {
    language,
    totalSessions,
    totalTurns,
    avgTurnsPerSession,
    totalClarifications,
    clarificationRatio: clamp(clarificationRatio),
    totalCorrections,
    correctionRatio: clamp(correctionRatio),
    avgRedosPerSession: 0,
    cleanExits,
    danglingExits,
    cleanExitRatio: clamp(cleanExitRatio),
  };
}
