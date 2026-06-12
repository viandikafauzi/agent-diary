# Agent Diary — Context

## Glossary

### Session
A bounded interaction between a user and an AI agent, identified by a unique ID, with a start time, optional end time, a model identifier, and a sequence of messages. Data sources (Hermes, Claude, Pi, OpenCode) all store these as "sessions." The TypeScript type was historically called `Conversation` but has been renamed to `Session` for consistency with upstream sources and user-facing language.

### Message
A single turn within a Session. Has a role (user, assistant, tool), content string, optional timestamp, optional tool calls, and optional token count.

### Source
An AI CLI tool whose session data is parsed by Agent Diary. Supported sources: hermes, pi, claude, opencode. Each source has its own parser that reads from a specific local storage format (SQLite or JSONL).

### Agent Message
A message with role "assistant" — the AI agent's response. Sentiment, tone, and behavior analysis run exclusively on agent messages.

### Sentiment
A numeric score (compound, normalized to [-1, 1]) representing the emotional polarity of an agent message. Positive = favorable, negative = unfavorable, neutral = neither. Computed per-message and aggregated per-session.

### Tone
Behavioral signals detected in agent messages via regex pattern matching: apology, confidence, uncertainty, helpfulness, self-correction, and question-asking. Counted and expressed as rates (per agent message).

### Interaction
Session-level quality metrics derived from user message patterns: correction rate (user correcting the agent), clarification rate (user asking for clarification), clean exit rate (conversation ended positively).

### Effectiveness Index
A composite score (0–100) combining sentiment compound, confidence net, and clean exit ratio. Labels: effective (≥60), balanced (≥40), struggling (<40). *(Note: current implementation uses 0–1 scale with different thresholds — see ADR-0002)*

### Notable Chat
An individual agent message flagged for extreme sentiment — top 5 most positive (best) or most negative (worst). Used in the HTML report to highlight standout moments.
