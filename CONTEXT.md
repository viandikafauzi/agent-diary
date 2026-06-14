# Agent Diary — Context

## Glossary

### Session
A bounded interaction between a user and an AI agent, identified by a unique ID, with a start time, optional end time, a model identifier, and a sequence of messages. Data sources (Hermes, Claude, Pi, OpenCode) all store these as "sessions." The TypeScript type was historically called `Conversation` but has been renamed to `Session` for consistency with upstream sources and user-facing language.

### Message
A single turn within a Session. Has a role (user, assistant, tool), content string, optional timestamp, optional tool calls, and optional token count.

### Source
An AI CLI tool whose session data is parsed by Agent Diary. Supported sources: hermes, pi, claude, opencode. Each source has its own parser that reads from a specific local storage format (SQLite or JSONL). **Hard rule: 1:1 mapping between source and parser.** One source = one parser, one CLI.

### Parser
The implementation that reads a specific AI CLI's local storage and produces Session objects. Always exactly one parser per source. Parser details (SQLite vs JSONL, specific file paths, schema differences) are implementation details — not part of the domain model.

### Agent Message
A message with role "assistant" — the AI agent's response. Sentiment, tone, and behavior analysis run exclusively on agent messages.

### Sentiment
A numeric score (compound, normalized to [-1, 1]) representing the emotional polarity of an agent message. Positive = favorable, negative = unfavorable, neutral = neither. Computed per-message and aggregated per-session.

### Tone
Behavioral signals detected in agent messages via regex pattern matching: apology, confidence, uncertainty, helpfulness, self-correction, and question-asking. Counted and expressed as rates (per agent message).

### Interaction
Session-level quality metrics derived from user message patterns: correction rate (user correcting the agent), clarification rate (user asking for clarification), clean exit rate (conversation ended positively).

### Effectiveness Index
A composite score (range: [-0.7, 1.0]) combining sentiment compound (×0.4), confidence net (×0.3), and clean exit ratio (×0.3). Labels: effective (≥0.3), balanced (≥0), struggling (<0). Displayed as raw score with label, NOT as percentage. Range tooltip shown in HTML.

### Notable Chat
An individual agent message flagged for extreme sentiment — top 5 most positive (best) or most negative (worst). Used in the HTML report to highlight standout moments.

### Model
The AI model identifier for a session (e.g., "deepseek-v4-pro"). Stored as metadata on each Session. Displayed in the session list for context. Does not track mid-conversation model changes (known limitation, future improvement).

### Tokens
Input and output token counts per session, sourced from each CLI's storage. All three fields are part of the domain model: `tokensInput`, `tokensOutput`, `totalTokens` (derived = input + output). `tokensReasoning` exists for sources that report it (Hermes).

### DateRange
A time window for session filtering, defined by `startMs` and `endMs` (epoch milliseconds, inclusive on both sides). Produced by `resolveDateRange()` in `date-utils.ts` from CLI flags (`--date` and `--range`). All timestamps are computed in **local time** to match parser behavior. Carries a human-readable `label` (e.g. "Jun 5–11, 2026" or "June 2026") and the raw `rangeArg` for filename generation. Single-day mode sets `rangeArg` to `null`.
