#!/usr/bin/env python3
"""Diagnose Claude session data — show first 5 lines per file."""
import json
from pathlib import Path

proj_dir = Path.home() / ".claude" / "projects"

for d in sorted(proj_dir.iterdir()):
    if not d.is_dir():
        continue
    print(f"\nProject: {d.name}")
    for f in sorted(d.glob("*.jsonl"))[:3]:
        print(f"\n  --- {f.name} ---")
        for i, raw in enumerate(f.read_text().split("\n")):
            raw = raw.strip()
            if not raw or i > 4:
                if i > 4:
                    print(f"  ... ({i} total lines read)")
                break
            try:
                obj = json.loads(raw)
                tp = obj.get("type", "?")
                ts = obj.get("timestamp", "?")
                if tp in ("assistant", "user"):
                    msg = obj.get("message", {})
                    content = msg.get("content", []) if isinstance(msg, dict) else []
                    preview = ""
                    if isinstance(content, list) and content:
                        for c in content:
                            if isinstance(c, dict) and c.get("type") == "text":
                                preview = c.get("text", "")[:80]
                                break
                    print(f"  [{i}] type={tp}  ts={ts}  preview={preview}")
                else:
                    print(f"  [{i}] type={tp}  ts={ts}")
            except:
                pass
    if len(list(d.glob("*.jsonl"))) > 3:
        print(f"  ... ({len(list(d.glob('*.jsonl')))} total files)")
