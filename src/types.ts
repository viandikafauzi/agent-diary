export interface Message {
  role: string;
  content: string;
  timestamp: Date | null;
  toolCalls: Record<string, unknown>[];
  toolName: string | null;
  finishReason: string | null;
  model: string | null;
  tokenCount: number | null;
}

export interface Session {
  id: string;
  source: string;
  model: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  endReason: string | null;
  messages: Message[];
  messageCount: number;
  toolCallCount: number;
  estimatedCostUsd: number;
  totalTokens: number;
  tokensInput: number;
  tokensOutput: number;
  tokensReasoning?: number;
}

export interface SentimentResult {
  overallCompound: number;
  dominantTone: "positive" | "negative" | "neutral";
  polarityDistribution: { positive: number; neutral: number; negative: number };
  perSession: Array<{ id: string; source: string; avgCompound: number; messageCount: number }>;
  perMessage: Array<{
    sessionId: string;
    source: string;
    msgIdx: number;
    contentPreview: string;
    compound: number;
    polarityLabel: string;
    tokensInput?: number;
    tokensOutput?: number;
  }>;
  totalAgentMessages: number;
}

export interface ToneResult {
  language: string;
  apologyCount: number;
  apologyRate: number;
  confidenceCount: number;
  uncertaintyCount: number;
  confidenceNet: number;
  helpfulnessCount: number;
  helpfulnessRate: number;
  selfCorrectionCount: number;
  selfCorrectionRate: number;
  questionCount: number;
  questionRate: number;
  totalAgentMessages: number;
  avgMessageLength: number;
}

export interface InteractionResult {
  language: string;
  totalSessions: number;
  totalTurns: number;
  avgTurnsPerSession: number;
  totalClarifications: number;
  clarificationRatio: number;
  totalCorrections: number;
  correctionRatio: number;
  avgRedosPerSession: number;
  cleanExits: number;
  danglingExits: number;
  cleanExitRatio: number;
}

export interface SourceMetrics {
  sessions: number;
  messages: number;
  toolCalls: number;
  tokens: number;
  avgTone: number | null;
}

export interface EffectivenessIndex {
  score: number;
  label: "effective" | "balanced" | "struggling";
}

export interface NotableChat {
  source: string;
  sessionId: string;
  msgIdx: number;
  compound: number;
  contentPreview: string;
  tokensInput?: number;
  tokensOutput?: number;
}

export interface AnalysisResult {
  sentiment: SentimentResult;
  tone: ToneResult;
  interaction: InteractionResult;
  effectiveness: EffectivenessIndex;
  sourcesData: Record<string, SourceMetrics>;
  notable: { best: NotableChat[]; worst: NotableChat[] };
  sessions: Session[];
}
