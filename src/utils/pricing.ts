/**
 * Centralized pricing data and cost estimation utilities.
 *
 * This is the single source of truth for all model pricing used by Agent Diary.
 * When providers change their rates or new models are added, update ONLY this file.
 *
 * Supported pricing sources:
 *   - Anthropic Claude (direct API pricing)
 *   - OpenCode Go (subscription models, exposed as per-token rates)
 *
 * Parsers should prefer native cost data from their own storage when available.
 * When native cost is missing or zero, this module provides a fallback estimate
 * based on the session's model name and token counts. This works for any source
 * (hermes, pi, claude, opencode) as long as the model name is recognized.
 *
 * Pricing format: USD per 1M tokens
 * Last updated: 2026-06-14
 *
 * Sources:
 *   - Claude: https://docs.anthropic.com/en/docs/about-claude/pricing
 *   - OpenCode Go: https://opencode.ai/docs/go
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModelPricing {
  /** Cost per 1M input/prompt tokens (USD) */
  input: number;
  /** Cost per 1M output/completion tokens (USD) */
  output: number;
  /** Cost per 1M cached-read tokens (USD), if supported by the provider */
  cachedRead?: number;
  /** Cost per 1M cached-write tokens (USD), if supported by the provider */
  cachedWrite?: number;
}

interface PricingRegistry {
  provider: string;
  table: Record<string, ModelPricing>;
  /** Recognized provider prefixes that should be stripped from model IDs */
  prefixes: string[];
  /**
   * Optional aliases: alternate names users/agents might use for a model.
   * Keys are aliases, values are the canonical key in `table`.
   */
  aliases?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Provider tables
// ---------------------------------------------------------------------------

/**
 * Anthropic Claude models.
 * @see https://docs.anthropic.com/en/docs/about-claude/pricing
 */
const CLAUDE_PRICING: Record<string, ModelPricing> = {
  // Claude 5 family
  "claude-fable-5": { input: 10, output: 50 },
  "claude-mythos-5": { input: 10, output: 50 },
  // Claude Opus 4 family
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-opus-4-5": { input: 5, output: 25 },
  // Deprecated: Opus 4 and 4.1
  "claude-opus-4-1": { input: 15, output: 75 },
  "claude-opus-4": { input: 15, output: 75 },
  // Claude Sonnet 4 family
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  // Deprecated: Sonnet 4
  "claude-sonnet-4": { input: 3, output: 15 },
  // Claude Haiku family
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-haiku-3-5": { input: 0.8, output: 4 },
  // Claude 3 family (legacy)
  "claude-3-7-sonnet": { input: 3, output: 15 },
  "claude-3-5-sonnet": { input: 3, output: 15 },
  "claude-3-5-haiku": { input: 0.8, output: 4 },
  "claude-3-opus": { input: 15, output: 75 },
  "claude-3-sonnet": { input: 3, output: 15 },
  "claude-3-haiku": { input: 0.25, output: 1.25 },
};

/**
 * OpenCode Go models.
 *
 * Go is a low-cost subscription, but OpenCode publishes the equivalent
 * per-token rates used for usage limits and top-ups. These rates are the
 * fallback when another agent (hermes, pi, claude, or opencode itself)
 * uses an OpenCode Go model and the parser has no native cost field.
 *
 * @see https://opencode.ai/docs/go
 */
const OPENCODE_GO_PRICING: Record<string, ModelPricing> = {
  // Zhipu GLM
  "glm-5.1": { input: 1.4, output: 4.4, cachedRead: 0.26 },
  "glm-5": { input: 1.0, output: 3.2, cachedRead: 0.2 },

  // Moonshot Kimi
  "kimi-k2.7": { input: 0.95, output: 4.0, cachedRead: 0.19 },
  "kimi-k2.6": { input: 0.95, output: 4.0, cachedRead: 0.16 },

  // Xiaomi MiMo
  "mimo-v2.5-pro": { input: 1.74, output: 3.48, cachedRead: 0.0145 },
  "mimo-v2.5": { input: 0.14, output: 0.28, cachedRead: 0.0028 },

  // MiniMax
  "minimax-m3": { input: 0.3, output: 1.2, cachedRead: 0.06 },
  "minimax-m2.7": { input: 0.3, output: 1.2, cachedRead: 0.06, cachedWrite: 0.375 },
  "minimax-m2.5": { input: 0.3, output: 1.2, cachedRead: 0.06, cachedWrite: 0.375 },

  // Alibaba Qwen
  "qwen3.7-max": { input: 2.5, output: 7.5, cachedRead: 0.5, cachedWrite: 3.125 },
  "qwen3.7-plus": { input: 0.4, output: 1.6, cachedRead: 0.04, cachedWrite: 0.5 },
  "qwen3.6-plus": { input: 0.5, output: 3.0, cachedRead: 0.05, cachedWrite: 0.625 },

  // DeepSeek
  "deepseek-v4-pro": { input: 1.74, output: 3.48, cachedRead: 0.0145 },
  "deepseek-v4-flash": { input: 0.14, output: 0.28, cachedRead: 0.0028 },
};

// Default fallback pricing when model is unknown
const DEFAULT_PRICING: ModelPricing = { input: 3, output: 15 }; // sonnet-4 tier

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Ordered list of pricing sources.
 *
 * OpenCode Go is checked first because its models are explicitly branded
 * (e.g. `opencode-go/kimi-k2.7`) and must win over any fuzzy Claude match.
 * Claude is checked second for all Anthropic-family model names.
 */
const PRICING_REGISTRIES: PricingRegistry[] = [
  {
    provider: "opencode-go",
    table: OPENCODE_GO_PRICING,
    prefixes: ["opencode-go/", "opencode-go-"],
    aliases: {
      "kimi-k2.7-code": "kimi-k2.7",
    },
  },
  {
    provider: "claude",
    table: CLAUDE_PRICING,
    prefixes: ["claude/", "anthropic/"],
  },
];

// ---------------------------------------------------------------------------
// Model name normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a raw model identifier for matching against pricing tables.
 *
 * Strips common provider prefixes, lowercases the string, and removes
 * date/version suffix noise so that e.g.:
 *   - "opencode-go/kimi-k2.7" -> "kimi-k2.7"
 *   - "claude-sonnet-4-20250514" -> "claude-sonnet-4-20250514" (kept for fuzzy matching)
 */
function normalizeModelId(model: string): string {
  let normalized = model.trim().toLowerCase();

  for (const registry of PRICING_REGISTRIES) {
    for (const prefix of registry.prefixes) {
      if (normalized.startsWith(prefix)) {
        normalized = normalized.slice(prefix.length);
        break;
      }
    }
  }

  // Resolve aliases (after prefix stripping)
  for (const registry of PRICING_REGISTRIES) {
    if (registry.aliases && registry.aliases[normalized]) {
      return registry.aliases[normalized];
    }
  }

  return normalized;
}

// ---------------------------------------------------------------------------
// Pricing lookup
// ---------------------------------------------------------------------------

/**
 * Find pricing for a model by name matching.
 *
 * Uses fuzzy matching within each registered provider table: checks for an
 * exact match first, then falls back to the longest substring match. This
 * handles version suffixes like dates (e.g. "claude-sonnet-4-20250514").
 *
 * OpenCode Go models are checked before Claude models so that branded
 * `opencode-go/*` identifiers resolve to Go rates even when the underlying
 * model name overlaps with another provider.
 *
 * @param model - Model name string (e.g. "opencode-go/kimi-k2.7")
 * @returns The matching pricing tier, or DEFAULT_PRICING if not found
 */
export function getModelPricing(model: string | null): ModelPricing {
  if (!model) return DEFAULT_PRICING;

  const normalized = normalizeModelId(model);

  for (const registry of PRICING_REGISTRIES) {
    const table = registry.table;

    // Exact match (fast path)
    if (normalized in table) {
      return table[normalized];
    }

    // Fuzzy match: find the longest matching key
    let bestMatch: ModelPricing | null = null;
    let bestKeyLength = 0;

    for (const [key, value] of Object.entries(table)) {
      if (normalized.includes(key) && key.length > bestKeyLength) {
        bestMatch = value;
        bestKeyLength = key.length;
      }
    }

    if (bestMatch) return bestMatch;
  }

  return DEFAULT_PRICING;
}

/**
 * Return the provider slug for a recognized model, or null if unknown.
 *
 * Useful for parsers that want to know whether a session used an OpenCode Go
 * model before deciding to apply fallback pricing.
 */
export function getPricingProvider(model: string | null): string | null {
  if (!model) return null;
  const normalized = normalizeModelId(model);

  for (const registry of PRICING_REGISTRIES) {
    const table = registry.table;
    if (normalized in table) return registry.provider;

    for (const key of Object.keys(table)) {
      if (normalized.includes(key)) return registry.provider;
    }
  }

  return null;
}

/** True if the model name resolves to the OpenCode Go provider. */
export function isOpencodeGoModel(model: string | null): boolean {
  return getPricingProvider(model) === "opencode-go";
}

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

/**
 * Estimate cost in USD from model name and token counts.
 *
 * Cached-read and cached-write tokens are optional. If the pricing table for
 * the model does not define cached rates, cached tokens are priced at the
 * regular input rate so the estimate stays conservative.
 *
 * @param model - Model name string (null uses default pricing)
 * @param inputTokens - Number of input/prompt tokens
 * @param outputTokens - Number of output/completion tokens
 * @param cachedReadTokens - Number of cached-read tokens (optional)
 * @param cachedWriteTokens - Number of cached-write tokens (optional)
 * @returns Estimated cost in USD
 */
export function estimateCost(
  model: string | null,
  inputTokens: number,
  outputTokens: number,
  cachedReadTokens: number = 0,
  cachedWriteTokens: number = 0,
): number {
  const pricing = getModelPricing(model);

  const readRate = pricing.cachedRead ?? pricing.input;
  const writeRate = pricing.cachedWrite ?? pricing.input;

  return (
    (inputTokens * pricing.input +
      outputTokens * pricing.output +
      cachedReadTokens * readRate +
      cachedWriteTokens * writeRate) /
    1_000_000
  );
}

export interface SessionCostOptions {
  /** Model name (may include provider prefix) */
  model: string | null;
  /** Native cost from the source's own storage, if available */
  nativeCostUsd?: number | null;
  /** Input/prompt tokens */
  inputTokens: number;
  /** Output/completion tokens */
  outputTokens: number;
  /** Cached-read tokens (optional) */
  cachedReadTokens?: number;
  /** Cached-write tokens (optional) */
  cachedWriteTokens?: number;
}

/**
 * Resolve a session's estimated cost.
 *
 * Prefers native cost data when the source already computed it. Otherwise
 * falls back to {@link estimateCost} using the model name and token counts.
 * This is the recommended helper for every parser.
 *
 * @returns Estimated cost in USD
 */
export function estimateSessionCost(options: SessionCostOptions): number {
  const native = options.nativeCostUsd ?? 0;
  if (native > 0) return native;

  return estimateCost(
    options.model,
    options.inputTokens,
    options.outputTokens,
    options.cachedReadTokens ?? 0,
    options.cachedWriteTokens ?? 0,
  );
}
