# AGENTS.md

## Project Overview

Agent Diary is an npm CLI tool that analyzes AI agent conversation logs and generates dark-themed HTML reports. It reads session data from multiple AI CLI tools (Hermes, Claude Code, Pi, OpenCode), runs sentiment/tone/interaction analysis, and produces a self-contained HTML dashboard.

**Zero Python dependency.** Pure TypeScript/Node.js. Runs via `npx agent-diary`.

## Architecture

```
src/
├── index.ts              # Entry point (#!/usr/bin/env node)
├── cli.ts                # CLI arg parsing, pipeline orchestration
├── types.ts              # All TypeScript interfaces (Session, Message, AnalysisResult, etc.)
├── parsers/              # One parser per source (1:1 mapping — hard rule)
│   ├── detector.ts       # Auto-detects installed AI CLIs
│   ├── hermes.ts         # SQLite reader (~/.hermes/state.db)
│   ├── pi.ts             # JSONL reader (~/.pi/agent/sessions/)
│   ├── claude.ts         # JSONL reader (~/.claude/projects/)
│   └── opencode.ts       # SQLite reader (~/.local/share/opencode/opencode.db)
├── analyzers/            # Three analysis passes
│   ├── lang_utils.ts     # Language detection (franc) + per-language pattern tables (EN, ID, KZ)
│   ├── sentiment.ts      # wink-sentiment scoring, normalized to [-1, 1]
│   ├── tone.ts           # Regex behavioral pattern matching (apology, confidence, etc.)
│   └── interaction.ts    # Session quality metrics (corrections, clarifications, exits)
├── reporters/
│   └── renderer.ts       # HTML generation (reads templates/report.html, injects data)
└── types/
    └── wink-sentiment.d.ts  # Type definitions for wink-sentiment
```

## Key Conventions

### Domain Model (see CONTEXT.md for glossary)
- **Session** (not "Conversation") — the canonical term for a bounded AI interaction
- **Source** — user-facing label (hermes, pi, claude, opencode). 1:1 with parsers.
- **Parser** — implementation detail. One parser per source, always.
- **Agent Message** — messages with role "assistant". All analysis runs on these.

### Code Style
- TypeScript strict mode, ESM modules (`"type": "module"` in package.json)
- All imports use `.js` extension for ESM compatibility
- No `any` types unless absolutely necessary
- Flat functions, no classes
- Each file has a single exported function (parseX, analyzeX, renderReport)

### Building & Running
```bash
npm run build          # tsc → dist/
node dist/index.js     # Run directly
node dist/index.js --date 2026-06-11 --sources hermes
```

### Data Flow
```
detector → parsers → sessions → analyzers → AnalysisResult → renderer → HTML
```

1. `detector.ts` checks which CLIs have data files
2. Each parser reads its source and returns `Session[]`
3. Sentiment, tone, and interaction analyzers process all sessions
4. `renderer.ts` serializes sessions to JSON, injects into HTML template
5. Output: self-contained HTML file (no external CSS/JS/fonts)

### Adding a New Source
1. Create `src/parsers/newsource.ts` — implement `parseNewSource(dateStr: string): Session[]`
2. Add detection logic in `src/parsers/detector.ts`
3. Register in `src/cli.ts` parser map
4. Follow the 1:1 rule: one source = one parser

### Adding a New Language
1. Add pattern tables in `src/analyzers/lang_utils.ts` (TONE and INTERACTION)
2. Register in `LANGUAGE_TONE_PATTERNS` and `LANGUAGE_INTERACTION_PATTERNS`
3. The `franc` detector auto-maps ISO 639-3 codes

## Gotchas

- **wink-sentiment API**: Returns `{score, normalizedScore, tokenizedPhrase}` — NOT `{comparative, tokens}`. Use `normalizedScore`.
- **Hermes tool calls**: Stored as `{function: {name: "...", arguments: "..."}}` — NOT `{name: "..."}`. Always check nested `function.name`.
- **Token serialization**: The `SerializedSession` interface in renderer.ts must include `tokensInput`, `tokensOutput`, `totalTokens` — otherwise HTML gets undefined.
- **Empty sessions**: A session with 0 messages is still a session. Don't filter it out.
- **Date validation**: Regex `/^\d{4}-\d{2}-\d{2}$/` is not enough — also validate month/day ranges semantically.
- **Effectiveness Index**: Raw score range is [-0.7, 1.0], NOT [0, 100]. Never display as percentage.
