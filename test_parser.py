#!/usr/bin/env python3
"""Test the actual parser against one session file."""
import sys
sys.path.insert(0, ".")

from pathlib import Path
from parsers.claude import _parse_session, _read_jsonl, _build_messages
from datetime import datetime, timezone

# Find the first session from the diagnostic
proj_dir = Path.home() / ".claude" / "projects"
for d in sorted(proj_dir.iterdir()):
    if not d.is_dir():
        continue
    for f in sorted(d.glob("*.jsonl")):
        print(f"\n=== {d.name}/{f.name} ===")
        
        # Simulate what diary.py would do
        # Use a wide date range to catch everything
        day_start = datetime(2020, 1, 1, tzinfo=timezone.utc)
        day_end = datetime(2030, 1, 1, tzinfo=timezone.utc)
        
        lines = _read_jsonl(f)
        msgs = _build_messages(lines, day_start, day_end)
        
        roles = {}
        for m in msgs:
            roles[m.role] = roles.get(m.role, 0) + 1
        
        print(f"  Parsed messages: {len(msgs)}")
        print(f"  Roles: {roles}")
        
        # Show first 3 messages of each type
        for role in ["user", "assistant", "toolResult"]:
            shown = 0
            for m in msgs:
                if m.role == role and shown < 2:
                    content_preview = (m.content or "")[:100]
                    tool_info = ""
                    if m.tool_calls:
                        tool_info = " [tools: " + ", ".join(tc.get("name","?") for tc in m.tool_calls) + "]"
                    print(f"  [{role}] content={content_preview}{tool_info}")
                    shown += 1
        
        exit(0)
