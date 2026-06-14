# Pricing

Cost estimation is centralized in `src/utils/pricing.ts`. This file is the single source of truth for all model pricing. When rates change or new models are added, update only this file.

## Design

- **Native cost first**: each parser uses the cost value stored by its own CLI when available.
- **Fallback estimation**: when native cost is missing or zero, Agent Diary estimates cost from the session's model name and token counts.
- **Multi-provider**: the pricing table supports multiple providers. A model name like `opencode-go/kimi-k2.7` resolves to OpenCode Go rates, while `claude-sonnet-4` resolves to Anthropic rates.
- **Cached tokens**: cached-read and cached-write rates are supported. Parsers pass cached token counts when their storage provides them.

## Supported providers

| Provider | Models |
|----------|--------|
| **Claude** | All Anthropic Claude 3 / 4 / 5 family models |
| **OpenCode Go** | GLM-5.1, GLM-5, Kimi K2.7, Kimi K2.6, MiMo-V2.5, MiMo-V2.5-Pro, MiniMax M3/M2.7/M2.5, Qwen3.7 Max/Plus, Qwen3.6 Plus, DeepSeek V4 Pro/Flash |

## Adding a provider

1. Add a new pricing table in `src/utils/pricing.ts`.
2. Register it in `PRICING_REGISTRIES` with provider slug and prefixes.
3. Update this file.

## Sources

- Claude: https://docs.anthropic.com/en/docs/about-claude/pricing
- OpenCode Go: https://opencode.ai/docs/go
