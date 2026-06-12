import type { Session, ToneResult } from "../types.js";
import {
  detectLanguage,
  getTonePatterns,
  matchTonePattern,
  hasQuestionMark,
  hasEmoji,
} from "../analyzers/lang_utils.js";

export function analyzeTone(sessions: Session[]): ToneResult {
  const agentMessages: string[] = [];

  for (const sess of sessions) {
    for (const msg of sess.messages) {
      if (msg.role === "assistant" && msg.content.length > 0) {
        agentMessages.push(msg.content);
      }
    }
  }

  const totalAgentMessages = agentMessages.length;

  if (totalAgentMessages === 0) {
    return {
      language: "en",
      apologyCount: 0,
      apologyRate: 0,
      confidenceCount: 0,
      uncertaintyCount: 0,
      confidenceNet: 0,
      helpfulnessCount: 0,
      helpfulnessRate: 0,
      selfCorrectionCount: 0,
      selfCorrectionRate: 0,
      questionCount: 0,
      questionRate: 0,
      totalAgentMessages: 0,
      avgMessageLength: 0,
    };
  }

  const language = detectLanguage(agentMessages);
  const patterns = getTonePatterns(language);

  let apologyCount = 0;
  let confidenceCount = 0;
  let uncertaintyCount = 0;
  let helpfulnessCount = 0;
  let selfCorrectionCount = 0;
  let questionCount = 0;
  let totalLength = 0;

  for (const content of agentMessages) {
    totalLength += content.length;

    if (matchTonePattern(patterns, "apology", content) || hasEmoji(content, "apology")) {
      apologyCount++;
    }
    if (matchTonePattern(patterns, "confidence", content) || hasEmoji(content, "confidence")) {
      confidenceCount++;
    }
    if (matchTonePattern(patterns, "uncertainty", content) || hasEmoji(content, "uncertainty")) {
      uncertaintyCount++;
    }
    if (matchTonePattern(patterns, "helpfulness", content) || hasEmoji(content, "helpfulness")) {
      helpfulnessCount++;
    }
    if (matchTonePattern(patterns, "self_correction", content) || hasEmoji(content, "self_correction")) {
      selfCorrectionCount++;
    }
    if (
      matchTonePattern(patterns, "agent_question", content) ||
      hasQuestionMark(content) ||
      hasEmoji(content, "question")
    ) {
      questionCount++;
    }
  }

  return {
    language,
    apologyCount,
    apologyRate: apologyCount / totalAgentMessages,
    confidenceCount,
    uncertaintyCount,
    confidenceNet: (confidenceCount - uncertaintyCount) / totalAgentMessages,
    helpfulnessCount,
    helpfulnessRate: helpfulnessCount / totalAgentMessages,
    selfCorrectionCount,
    selfCorrectionRate: selfCorrectionCount / totalAgentMessages,
    questionCount,
    questionRate: questionCount / totalAgentMessages,
    totalAgentMessages,
    avgMessageLength: totalLength / totalAgentMessages,
  };
}
