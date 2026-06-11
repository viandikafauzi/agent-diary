# Agent Diary

Sentiment + interaction analysis of AI agent conversation logs. Generates a dark-themed HTML report summarizing your daily conversations across multiple AI CLI tools.

![output](https://img.shields.io/badge/output-HTML-darkgreen)

## Supported Sources

| Source | CLI Tool | Data Location |
|--------|----------|---------------|
| **pi** | [pi](https://pi.dev) coding agent | `~/.pi/agent/sessions/*.jsonl` |
| **hermes** | [Hermes](https://github.com/earendil-works/hermes) AI shell | `~/.hermes/state.db` |
| **claude** | [Claude Code](https://code.claude.com) | `~/.claude/projects/*/sessions-index.json` + `.jsonl` |
| **opencode** | [OpenCode](https://opencode.ai) | `~/.local/share/opencode/opencode.db` |

## Quick Start

```bash
# Clone & set up
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Analyze today's conversations (NLTK data auto-downloaded on first run)
python diary.py

# Analyze a specific date
python diary.py --date 2026-05-31

# Analyze only one source
python diary.py --sources pi

# Custom output path
python diary.py --date 2026-05-31 --output my-report.html
```

## How It Works

1. **Parsers** extract conversation logs from each AI CLI's local storage.
2. **Analyzers** run three passes over the data:
   - **Sentiment** — NLTK VADER polarity + TextBlob subjectivity on agent (assistant) messages — what the agent expresses.
   - **Behavior** — Regex word-boundary matching on agent messages for apology, confidence, uncertainty, helpfulness, self-correction, and clarification questions. Supports **multiple languages** (English + Indonesian) with automatic language detection via `langdetect`, plus universal character-level heuristics (emoji, punctuation, repeated chars) as fallback.
   - **Interaction** — Session quality metrics: correction rate, clarification rate, re-do rate, exit quality. Also language-aware with per-language pattern tables.
3. **Reporters** render an interactive HTML dashboard.

## HTML Report Features

- Overall agent tone (positive/negative/neutral) and subjectivity
- Agent effectiveness score (apology rate, confidence, helpfulness, self-correction, interaction quality)
- Polarity distribution chart
- Agent behavior breakdown
- Interaction quality metrics
- Per-source comparison table
- Notable chats (best/worst per-message sentiment)
- Clickable session transcripts with full message history
- In/out token counts per conversation
- Source filtering (when multiple sources are active)

## Project Layout

```
agent-diary/
├── diary.py              # Main entry point
├── requirements.txt      # Python dependencies
├── parsers/              # Source-specific log extractors
│   ├── base.py           # Conversation & Message dataclasses
│   ├── pi.py             # Pi JSONL session parser
│   ├── hermes.py         # Hermes SQLite session parser
│   ├── claude.py         # Claude Code JSONL transcript parser
│   └── opencode.py       # OpenCode SQLite session parser
├── analyzers/            # Analysis passes
│   ├── lang_utils.py     # Language detection + per-language pattern tables (en, id)
│   ├── sentiment.py      # VADER polarity + TextBlob subjectivity (agent messages)
│   ├── tone.py           # Agent behaviour: apology, confidence, helpfulness, self-correction
│   └── interaction.py    # Clarification/correction/exit quality
├── reporters/
│   └── html.py           # Jinja2 HTML renderer
├── templates/
│   └── report.html       # HTML template with embedded CSS/JS
└── output/               # Generated reports (gitignored)
    └── diary-YYYY-MM-DD.html
```

## Requirements

- Python 3.10+
- `nltk` ≥ 3.9
- `jinja2` ≥ 3.1
- `textblob` ≥ 0.17
- `langdetect` ≥ 1.0.9 (optional — enables automatic language detection for multilingual tone analysis; falls back to English patterns)

## Multilingual Support

The tone and interaction analyzers now support **multiple languages**:

| Language | Code | Tone Patterns | Interaction Patterns |
|----------|------|---------------|---------------------|
| English  | `en` | ✅ Full set   | ✅ Full set         |
| Indonesian | `id` | ✅ Full set | ✅ Full set         |

**How it works:**
1. Message text is sampled and language-detected via `langdetect`
2. The appropriate per-language pattern table is selected (bagian word-boundary regex for tone, substring matching for interaction)
3. Universal **structural heuristics** (question marks, exclamation marks, emoji, repeated characters) complement the patterns — these work for any language
4. If `langdetect` is not installed, or the language is unsupported, the system falls back to English patterns + structural heuristics

To add a new language, edit `analyzers/lang_utils.py` and add entries to `LANGUAGE_TONE_PATTERNS` and `LANGUAGE_INTERACTION_PATTERNS`.

## License

MIT
