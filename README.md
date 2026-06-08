# Agent Diary

Sentiment + interaction analysis of AI agent conversation logs. Generates a dark-themed HTML report summarizing your daily conversations across multiple AI CLI tools.

![output](https://img.shields.io/badge/output-HTML-darkgreen)

## Supported Sources

| Source | CLI Tool | Data Location |
|--------|----------|---------------|
| **pi** | [pi](https://pi.dev) coding agent | `~/.pi/agent/sessions/*.jsonl` |
| **hermes** | [Hermes](https://github.com/earendil-works/hermes) AI shell | `~/.hermes/state.db` |
| **claude** | [Claude Code](https://code.claude.com) | `~/.claude/projects/*/sessions-index.json` + `.jsonl` |

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
   - **Behavior** — Regex word-boundary matching on agent messages for apology, confidence, uncertainty, helpfulness, self-correction, and clarification questions.
   - **Interaction** — Session quality metrics: correction rate, clarification rate, re-do rate, exit quality.
3. **Reporters** render an interactive HTML dashboard.

## HTML Report Features

- Overall agent tone (positive/negative/neutral) and subjectivity
- Agent effectiveness score (apology rate, confidence, helpfulness, self-correction, interaction quality)
- Polarity distribution chart
- Agent behavior breakdown
- Interaction quality metrics
- Per-source comparison table
- Notable conversations (best/worst sentiment)
- Clickable session transcripts with full message history
- Source filtering (when multiple sources are active)

## Project Layout

```
agent-diary/
├── diary.py              # Main entry point
├── requirements.txt      # Python dependencies (nltk, jinja2)
├── parsers/              # Source-specific log extractors
│   ├── base.py           # Conversation & Message dataclasses
│   ├── pi.py             # Pi JSONL session parser
│   ├── hermes.py         # Hermes SQLite session parser
│   └── claude.py         # Claude Code JSONL transcript parser
├── analyzers/            # Analysis passes
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

## License

MIT
