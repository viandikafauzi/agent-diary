#!/usr/bin/env python3
"""Diagnose Claude session data."""
import json
from pathlib import Path

proj_dir = Path.home() / ".claude" / "projects"
print("Projects dir exists:", proj_dir.is_dir())

if not proj_dir.is_dir():
    print("No ~/.claude/projects/ — is Claude Code installed?")
    exit(1)

for d in sorted(proj_dir.iterdir()):
    if not d.is_dir():
        continue
    print(f"\nProject: {d.name}")

    # sessions-index.json
    idx = d / "sessions-index.json"
    if idx.exists():
        data = json.loads(idx.read_text())
        entries = data.get("entries", [])
        print(f"  Index entries: {len(entries)}")
        for e in entries[:5]:
            sid = e.get("sessionId", "?")
            fp = e.get("fullPath", "?")
            cr = e.get("created", "?")
            print(f"    sid={str(sid)[:30]}  fullPath={fp}  created={cr}")
    else:
        print("  No sessions-index.json")

    # .jsonl files
    jsonl_files = sorted(d.glob("*.jsonl"))
    print(f"  JSONL files: {len(jsonl_files)}")
    for f in jsonl_files[:5]:
        try:
            line1 = f.read_text().split("\n", 1)[0].strip()
            obj = json.loads(line1)
            ts = obj.get("timestamp", "?")
            tp = obj.get("type", "?")
            print(f"    {f.name}  type={tp}  ts={ts}")
        except Exception as exc:
            print(f"    {f.name}  ERROR: {exc}")

print("\nDone.")
