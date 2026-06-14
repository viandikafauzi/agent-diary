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
  title: string | null;
  source: string;
  model: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  messages: Message[];
  messageCount: number;
  toolCallCount: number;
  estimatedCostUsd: number;
  totalTokens: number;
  tokensInput: number;
  tokensOutput: number;
  tokensReasoning?: number;
  tokensCachedRead?: number;
  tokensCachedWrite?: number;
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
  correctionScore: number;
  clarificationScore: number;
}

export interface SourceMetrics {
  sessions: number;
  messages: number;
  toolCalls: number;
  tokens: number;
  cost: number;
  avgTone: number | null;
}

export interface EffectivenessIndex {
  score: number;
  label: "effective" | "balanced" | "struggling";
}

// ---------------------------------------------------------------------------
// Date range types
// ---------------------------------------------------------------------------

export interface DateRange {
  /** Unix epoch ms for the start of the range (inclusive) */
  startMs: number;
  /** Unix epoch ms for the end of the range (inclusive) */
  endMs: number;
  /** Human-readable label for the report header (e.g. "Jun 5–11, 2026") */
  label: string;
  /** The raw --range argument, or null for single-day mode */
  rangeArg: string | null;
}

export type RangeMode = 'week' | 'month' | 'year';

export interface NotableConversation {
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
  perSourceAnalysis: Record<string, { sentiment: SentimentResult; tone: ToneResult; interaction: InteractionResult; effectiveness: EffectivenessIndex }>;
  sourcesData: Record<string, SourceMetrics>;
  notable?: { best: NotableConversation[]; worst: NotableConversation[] };
  sessions: Session[];
}
