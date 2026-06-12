# Agent Diary

Sentiment + interaction analysis of AI agent conversation logs. Generates a dark-themed HTML report summarizing your daily conversations across multiple AI CLI tools.

![output](https://img.shields.io/badge/output-HTML-darkgreen)
![npm](https://img.shields.io/badge/npm-agent--diary-blue)
![node](https://img.shields.io/badge/node-%3E%3D18-green)

## Quick Start

```bash
# No installation needed — runs directly via npx
npx agent-diary

# Analyze a specific date
npx agent-diary --date 2026-06-11

# Analyze only specific sources
npx agent-diary --sources hermes,claude

# Custom output path
npx agent-diary --date 2026-06-11 --output my-report.html
```

**Requirements:** Node.js ≥ 18. That's it. No Python, no virtualenv, no pip.

## Supported Sources

| Source | CLI Tool | Data Location |
|--------|----------|---------------|
| **hermes** | [Hermes](https://github.com/earendil-works/hermes) AI shell | `~/.hermes/state.db` |
| **pi** | [pi](https://pi.dev) coding agent | `~/.pi/agent/sessions/*.jsonl` |
| **claude** | [Claude Code](https://code.claude.com) | `~/.claude/projects/*/<session>.jsonl` |
| **opencode** | [OpenCode](https://opencode.ai) | `~/.local/share/opencode/opencode.db` |

Sources are auto-detected. If a CLI isn't installed, its parser is silently skipped.

## How It Works

1. **Parsers** extract session logs from each AI CLI's local storage (one parser per source).
2. **Analyzers** run three passes over agent (assistant) messages:
   - **Sentiment** — polarity scoring via wink-sentiment, normalized to [-1, 1].
   - **Tone** — regex pattern matching for apology, confidence, uncertainty, helpfulness, self-correction, and question-asking. Supports **English, Indonesian, and Kazakh** with automatic language detection via [franc](https://github.com/wooorm/franc).
   - **Interaction** — session quality metrics: correction rate, clarification rate, clean exit rate.
3. **Reporter** renders an interactive HTML dashboard with embedded CSS and JavaScript.

## HTML Report Features

- Overall agent sentiment (positive/negative/neutral)
- Effectiveness score with labeled rating (effective/balanced/struggling)
- Polarity distribution chart
- Agent behavior breakdown (tone rates)
- Interaction quality metrics
- Per-source comparison table
- Notable chats — best and worst agent messages by sentiment
- Clickable session transcripts with full message history
- In/out token counts per session
- Source filtering (when multiple sources are active)

## CLI Options

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--date` | `-d` | today | Target date in YYYY-MM-DD format |
| `--sources` | `-s` | all detected | Comma-separated list: hermes,pi,claude,opencode |
| `--output` | `-o` | `output/diary-YYYY-MM-DD.html` | Custom output path |
| `--help` | `-h` | — | Show usage |

## Project Layout

```
agent-diary/
├── src/                    # TypeScript source
│   ├── index.ts            # Entry point (#!/usr/bin/env node)
│   ├── cli.ts              # CLI parsing + pipeline orchestration
│   ├── types.ts            # All interfaces (Session, Message, AnalysisResult)
│   ├── parsers/            # One parser per source (1:1 mapping)
│   │   ├── detector.ts     # Auto-detect installed CLIs
│   │   ├── hermes.ts       # SQLite reader
│   │   ├── pi.ts           # JSONL reader
│   │   ├── claude.ts       # JSONL reader
│   │   └── opencode.ts     # SQLite reader
│   ├── analyzers/          # Three analysis passes
│   │   ├── lang_utils.ts   # Language detection + pattern tables (EN, ID, KZ)
│   │   ├── sentiment.ts    # Polarity scoring
│   │   ├── tone.ts         # Behavioral pattern matching
│   │   └── interaction.ts  # Session quality metrics
│   └── reporters/
│       └── renderer.ts     # HTML generation
├── templates/
│   └── report.html         # HTML template with dark theme CSS
├── CONTEXT.md              # Domain glossary and rules
├── AGENTS.md               # Guide for AI coding agents
├── package.json
└── tsconfig.json
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run
node dist/index.js --date 2026-06-11

# Watch mode
npm run dev
```

## Architecture Decisions

See [CONTEXT.md](CONTEXT.md) for the domain glossary and [AGENTS.md](AGENTS.md) for architecture details and conventions.

Key decisions:
- **1:1 source-to-parser mapping** — each AI CLI gets exactly one parser
- **Session** is the canonical term (not "Conversation")
- **No Python dependency** — full TypeScript rewrite from the original Python implementation
- **Self-contained HTML** — no external CSS, JS, or font dependencies

## Multilingual Support

| Language | Code | Tone Patterns | Interaction Patterns |
|----------|------|---------------|---------------------|
| English | `en` | ✅ Full set | ✅ Full set |
| Indonesian | `id` | ✅ Full set | ✅ Full set |
| Kazakh | `kk` | ✅ Full set | ✅ Full set |

Language is auto-detected per session via [franc](https://github.com/wooorm/franc). Falls back to English for unsupported languages.

To add a new language, add pattern tables in `src/analyzers/lang_utils.ts`.

## License

MIT
