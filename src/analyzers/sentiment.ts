import sentiment from "wink-sentiment";
import type { Session, SentimentResult } from "../types.js";

export function analyzeSentiment(sessions: Session[]): SentimentResult {
  const perSession: SentimentResult["perSession"] = [];
  const perMessage: SentimentResult["perMessage"] = [];
  const polarityDistribution = { positive: 0, neutral: 0, negative: 0 };
  let agentMessageCount = 0;
  let totalCompound = 0;

  for (const sess of sessions) {
    const assistantMsgs = sess.messages.filter(
      (m) => m.role === "assistant" && m.content.length > 0,
    );

    if (assistantMsgs.length === 0) {
      perSession.push({
        id: sess.id,
        source: sess.source,
        avgCompound: 0,
        messageCount: 0,
      });
      continue;
    }

    let sessCompoundSum = 0;
    const tokensPerMsg =
      assistantMsgs.length > 0
        ? {
            input: Math.round(sess.tokensInput / assistantMsgs.length),
            output: Math.round(sess.tokensOutput / assistantMsgs.length),
          }
        : { input: undefined as number | undefined, output: undefined as number | undefined };

    for (let i = 0; i < assistantMsgs.length; i++) {
      const msg = assistantMsgs[i];
      const result = sentiment(msg.content);
      const normalized = Math.min(1, Math.max(-1, result.normalizedScore));

      let polarityLabel: string;
      if (normalized >= 0.05) {
        polarityLabel = "positive";
      } else if (normalized <= -0.05) {
        polarityLabel = "negative";
      } else {
        polarityLabel = "neutral";
      }

      sessCompoundSum += normalized;
      agentMessageCount++;
      totalCompound += normalized;
      polarityDistribution[polarityLabel as keyof typeof polarityDistribution]++;

      perMessage.push({
        sessionId: sess.id,
        source: sess.source,
        msgIdx: sess.messages.indexOf(msg),
        contentPreview: msg.content.slice(0, 150),
        compound: normalized,
        polarityLabel,
        tokensInput: tokensPerMsg.input,
        tokensOutput: tokensPerMsg.output,
      });
    }

    perSession.push({
      id: sess.id,
      source: sess.source,
      avgCompound: sessCompoundSum / assistantMsgs.length,
      messageCount: assistantMsgs.length,
    });
  }

  const overallCompound =
    agentMessageCount > 0 ? totalCompound / agentMessageCount : 0;

  let dominantTone: SentimentResult["dominantTone"];
  if (overallCompound >= 0.05) {
    dominantTone = "positive";
  } else if (overallCompound <= -0.05) {
    dominantTone = "negative";
  } else {
    dominantTone = "neutral";
  }

  return {
    overallCompound,
    dominantTone,
    polarityDistribution,
    perSession,
    perMessage,
    totalAgentMessages: agentMessageCount,
  };
}
