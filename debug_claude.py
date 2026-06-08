#!/usr/bin/env python3
"""Diagnose Claude session data — scan entire jsonl files for messages."""
import json
from pathlib import Path
from collections import Counter

proj_dir = Path.home() / ".claude" / "projects"

if not proj_dir.is_dir():
    print("No ~/.claude/projects/")
    exit(1)

for d in sorted(proj_dir.iterdir()):
    if not d.is_dir():
        continue
    jsonl_files = sorted(d.glob("*.jsonl"))
    total_lines = 0
    type_counts = Counter()

    for f in jsonl_files:
        for raw in f.read_text().split("\n"):
            raw = raw.strip()
            if not raw:
                continue
            total_lines += 1
            try:
                obj = json.loads(raw)
                tp = obj.get("type", "?")
                type_counts[tp] += 1
            except:
                pass

    print(f"\nProject: {d.name} ({len(jsonl_files)} files, {total_lines} total lines)")
    for tp, count in type_counts.most_common():
        print(f"  {tp}: {count}")

# Show one full file that has user/assistant messages
print("\n--- Looking for a file with user/assistant messages ---")
found = False
for d in sorted(proj_dir.iterdir()):
    if not d.is_dir():
        continue
    for f in sorted(d.glob("*.jsonl")):
        has_conversation = False
        lines = []
        for raw in f.read_text().split("\n"):
            raw = raw.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
                tp = obj.get("type", "")
                if tp in ("user", "assistant"):
                    has_conversation = True
                lines.append(obj)
            except:
                pass
        if has_conversation:
            print(f"\nFile: {d.name}/{f.name} ({len(lines)} lines)")
            for i, obj in enumerate(lines[:10]):
                tp = obj.get("type", "?")
                ts = obj.get("timestamp", "?")
                msg = obj.get("message", {})
                content_blobs = msg.get("content", []) if isinstance(msg, dict) else []
                content_preview = ""
                for c in content_blobs:
                    if isinstance(c, dict):
                        if c.get("type") == "text":
                            content_preview = c.get("text", "")[:60]
                            break
                        elif c.get("type") == "tool_use":
                            content_preview = f"[tool: {c.get('name','?')}]"
                            break
                print(f"  [{i}] type={tp}  ts={ts}  content={content_preview}")
            if len(lines) > 10:
                print(f"  ... ({len(lines)} total lines)")
            found = True
            break
    if found:
        break

if not found:
    print("No files with user/assistant messages found!")
    print("(Checking if there's a different data location...)")
    for alt in [Path.home() / ".claude" / "sessions",
                Path.home() / ".claude" / "conversations",
                Path.home() / ".claude"]:
        if alt.is_dir():
            print(f"  {alt} exists: {list(alt.iterdir())[:5]}")
