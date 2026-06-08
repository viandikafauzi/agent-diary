#!/usr/bin/env python3
"""Diagnose Claude session data — dump raw user message structure."""
import json
from pathlib import Path

proj_dir = Path.home() / ".claude" / "projects"

for d in sorted(proj_dir.iterdir()):
    if not d.is_dir():
        continue
    for f in sorted(d.glob("*.jsonl")):
        for raw in f.read_text().split("\n"):
            raw = raw.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if obj.get("type") != "user":
                continue
            msg = obj.get("message", {})
            content = msg.get("content", [])
            if not content:
                print(f"\nFile: {d.name}/{f.name}")
                print(f"  type=user  ts={obj.get('timestamp','?')}")
                print(f"  message keys: {list(msg.keys())}")
                print(f"  message.content: {content}")
                print(f"  userType: {obj.get('userType','?')}")
                # Show full message dict (truncated)
                msg_str = json.dumps(msg, indent=2, default=str)
                print(f"  Full message:\n{msg_str[:800]}")
                # Also show if there's text elsewhere in the line
                for k, v in obj.items():
                    if k not in ("message", "type", "sessionId", "uuid", "parentUuid", "timestamp", "cwd", "entrypoint", "gitBranch", "isSidechain", "userType", "version"):
                        s = json.dumps(v, default=str)
                        print(f"  extra field [{k}]: {s[:200]}")
                exit(0)
            
            # Has content — show first block
            for i, block in enumerate(content[:3]):
                if isinstance(block, dict):
                    bt = block.get("type", "?")
                    if bt == "text":
                        print(f"\nFile: {d.name}/{f.name}")
                        print(f"  type=user  ts={obj.get('timestamp','?')}")
                        print(f"  block[{i}] type={bt} text={block.get('text','')[:200]}")
                        exit(0)
                    else:
                        print(f"\nFile: {d.name}/{f.name}")
                        print(f"  type=user  ts={obj.get('timestamp','?')}")
                        # Show raw content blocks
                        for j, c in enumerate(content):
                            if isinstance(c, dict):
                                t = json.dumps(c, default=str)
                                print(f"  block[{j}]: {t[:300]}")
                        exit(0)

print("No user messages with content found!")
print("Looking at ANY user line...")
for d in sorted(proj_dir.iterdir()):
    if not d.is_dir():
        continue
    for f in sorted(d.glob("*.jsonl")):
        for raw in f.read_text().split("\n"):
            raw = raw.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
            except:
                continue
            if obj.get("type") == "user":
                obj_str = json.dumps(obj, indent=2, default=str)
                print(f"\nFile: {d.name}/{f.name}")
                print(obj_str[:1500])
                exit(0)
