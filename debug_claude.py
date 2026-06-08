#!/usr/bin/env python3
"""Diagnose Claude — find user messages with text blocks, and assistant blocks."""
import json
from pathlib import Path

proj_dir = Path.home() / ".claude" / "projects"

print("=== Searching for USER messages with 'text' blocks ===")
found = False
for d in sorted(proj_dir.iterdir()):
    if not d.is_dir() or found:
        continue
    for f in sorted(d.glob("*.jsonl")):
        if found:
            break
        for raw in f.read_text().split("\n"):
            raw = raw.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
            except:
                continue
            if obj.get("type") != "user":
                continue
            msg = obj.get("message", {})
            content = msg.get("content", [])
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    found = True
                    print(f"File: {d.name}/{f.name}")
                    print(f"  ts={obj.get('timestamp','?')}")
                    print(f"  text={block.get('text','')[:300]}")
                    break

if not found:
    print("NO user messages with text blocks found!")
    print("\n=== Showing all block types in user messages ===")
    from collections import Counter
    block_types = Counter()
    sample = {}
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
                if obj.get("type") != "user":
                    continue
                msg = obj.get("message", {})
                content = msg.get("content", [])
                for block in content:
                    if isinstance(block, dict):
                        bt = block.get("type", "?")
                        block_types[bt] += 1
                        if bt not in sample:
                            sample[bt] = json.dumps(block, default=str)[:200]
    for bt, cnt in block_types.most_common():
        print(f"  {bt}: {cnt}  sample={sample.get(bt,'')}")

print("\n=== How many messages of each role in a parsed conversation? ===")
for d in sorted(proj_dir.iterdir()):
    if not d.is_dir():
        continue
    for f in sorted(d.glob("*.jsonl"))[:1]:
        roles = Counter()
        for raw in f.read_text().split("\n"):
            raw = raw.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
            except:
                continue
            tp = obj.get("type", "")
            if tp in ("user", "assistant"):
                msg = obj.get("message", {})
                role = msg.get("role", "?")
                roles[role] += 1
        print(f"  {d.name}/{f.name}: {dict(roles)}")
        break
