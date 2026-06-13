import type { Session, InteractionResult } from "../types.js";
import {
  detectLanguage,
  getInteractionPatterns,
  scoreInteractionPattern,
} from "../analyzers/lang_utils.js";
import winkSentiment from "wink-sentiment";

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

  const perSessionCorrScores: number[] = [];
  const perSessionClarScores: number[] = [];

  for (const sess of sessions) {
    const messages = sess.messages;

    if (messages.length === 0) continue;

    let sessionUserMsgCount = 0;
    let sessionCorrSum = 0;
    let sessionClarSum = 0;

    for (const msg of messages) {
      if (msg.content.length === 0) continue;

      if (msg.role === "user") {
        totalUserMessages++;
        sessionUserMsgCount++;

        const sent = winkSentiment(msg.content).normalizedScore;

        const cs = scoreInteractionPattern(patterns, "correction", msg.content, sent, language);

        sessionCorrSum += cs;

        if (cs > 0) totalCorrections++;
      } else if (msg.role === "assistant") {
        totalAssistantMessages++;

        const qs = scoreInteractionPattern(patterns, "clarification_question", msg.content);

        sessionClarSum += qs;

        if (qs > 0) totalClarifications++;
      }
    }

    // Per-session average scores
    perSessionCorrScores.push(sessionUserMsgCount > 0 ? sessionCorrSum / sessionUserMsgCount : 0);
    perSessionClarScores.push(sessionUserMsgCount > 0 ? sessionClarSum / sessionUserMsgCount : 0);
  }

  const totalTurns = totalUserMessages + totalAssistantMessages;

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
      correctionScore: 0,
      clarificationScore: 0,
    };
  }

  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

  const avgTurnsPerSession = totalTurns / totalSessions;
  const correctionRatio = totalTurns > 0 ? totalCorrections / totalTurns : 0;
  const clarificationRatio = totalTurns > 0 ? totalClarifications / totalTurns : 0;

  const correctionScore = perSessionCorrScores.length > 0
    ? perSessionCorrScores.reduce((a, b) => a + b, 0) / perSessionCorrScores.length
    : 0;
  const clarificationScore = perSessionClarScores.length > 0
    ? perSessionClarScores.reduce((a, b) => a + b, 0) / perSessionClarScores.length
    : 0;
  return {
    language,
    totalSessions,
    totalTurns,
    avgTurnsPerSession,
    totalClarifications,
    clarificationRatio: clamp01(clarificationRatio),
    totalCorrections,
    correctionRatio: clamp01(correctionRatio),
    correctionScore: clamp01(correctionScore),
    clarificationScore: clamp01(clarificationScore),
  };
}
