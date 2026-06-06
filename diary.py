#!/usr/bin/env python3
"""Agent Diary — Sentiment + interaction analysis of AI agent conversation logs."""

import argparse
import sys
from datetime import datetime

from parsers import hermes, pi
from analyzers import sentiment, tone, interaction
from reporters import html


def main():
    parser = argparse.ArgumentParser(
        description="Analyze AI agent conversation logs and generate an HTML sentiment report."
    )
    parser.add_argument(
        "--date",
        default=datetime.now().strftime("%Y-%m-%d"),
        help="Target date in YYYY-MM-DD format (default: today)",
    )
    parser.add_argument(
        "--sources",
        default="",
        help="Comma-separated list of sources to include (hermes,pi). Default: all installed.",
    )
    parser.add_argument(
        "--output",
        default="",
        help="Override output HTML path.",
    )

    args = parser.parse_args()

    try:
        datetime.strptime(args.date, "%Y-%m-%d")
    except ValueError:
        print(f"Error: Invalid date format '{args.date}'. Use YYYY-MM-DD.")
        sys.exit(1)

    requested = [s.strip() for s in args.sources.split(",") if s.strip()] if args.sources else None

    parsers = [
        ("hermes", hermes.is_installed, hermes.extract),
        ("pi", pi.is_installed, pi.extract),
    ]

    active_sources = []
    all_conversations = []

    for name, check, extract in parsers:
        if requested and name not in requested:
            continue
        if not check():
            if requested and name in requested:
                print(f"Warning: '{name}' is not installed — skipping.")
            continue
        active_sources.append(name)
        try:
            convs = extract(args.date)
            all_conversations.extend(convs)
            print(f"  {name}: {len(convs)} session(s) found")
        except Exception as e:
            print(f"  {name}: error — {e}")

    if not active_sources:
        print("No AI CLIs found on this system.")
        sys.exit(1)

    if not all_conversations:
        print(f"No sessions found for {args.date}")
        sys.exit(0)

    print(f"\nAnalyzing {len(all_conversations)} session(s)...")

    sentiment_result = sentiment.analyze(all_conversations)
    tone_result = tone.analyze(all_conversations)
    interaction_result = interaction.analyze(all_conversations)

    output_path = html.render(
        date_str=args.date,
        sentiment=sentiment_result,
        tone=tone_result,
        interaction=interaction_result,
        conversations=all_conversations,
        sources=active_sources,
        output_path=args.output or "",
    )

    print(f"Report saved to: {output_path}")


if __name__ == "__main__":
    main()
