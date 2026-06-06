import json
import glob
import os
from datetime import datetime, timezone
from pathlib import Path

from .base import Conversation, Message

PI_SESSIONS_DIR = Path.home() / ".pi" / "agent" / "sessions"


def is_installed() -> bool:
    return PI_SESSIONS_DIR.is_dir()


def extract(date_str: str) -> list[Conversation]:
    target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    day_start = datetime(target_date.year, target_date.month, target_date.day, tzinfo=timezone.utc)
    day_end = datetime(target_date.year, target_date.month, target_date.day, 23, 59, 59, 999999, tzinfo=timezone.utc)

    conversations = []
    jsonl_files = sorted(glob.glob(os.path.join(str(PI_SESSIONS_DIR), "**/*.jsonl"), recursive=True))

    for filepath in jsonl_files:
        session_data = _parse_jsonl(filepath)
        if not session_data:
            continue

        session_ts = session_data.get("session_timestamp")
        if session_ts is None:
            continue
        if session_ts < day_start or session_ts > day_end:
            continue

        messages = _build_messages(session_data["events"], session_data["model"])
        if not messages:
            continue

        tool_count = sum(1 for m in messages if m.tool_calls)
        started = session_data["session_timestamp"]

        conversations.append(Conversation(
            id=session_data["session_id"],
            source="pi",
            model=session_data["model"],
            started_at=started,
            messages=messages,
            message_count=len(messages),
            tool_call_count=tool_count,
        ))

    return conversations


def _parse_jsonl(filepath: str) -> dict | None:
    session_id = None
    session_timestamp = None
    model = None
    events = []

    try:
        with open(filepath) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue

                t = obj.get("type")
                if t == "session":
                    session_id = obj.get("id")
                    ts_str = obj.get("timestamp")
                    if ts_str:
                        session_timestamp = _parse_iso(ts_str)
                elif t == "model_change":
                    model = obj.get("modelId") or obj.get("model") or model
                elif t == "message":
                    events.append(obj)
    except Exception:
        return None

    if not session_id:
        return None

    return {
        "session_id": session_id,
        "session_timestamp": session_timestamp,
        "model": model,
        "events": events,
    }


def _build_messages(events: list[dict], default_model: str | None) -> list[Message]:
    messages = []
    for evt in events:
        msg = evt.get("message", evt)
        role = msg.get("role", "")
        content_blocks = msg.get("content", [])
        if not isinstance(content_blocks, list):
            content_blocks = [content_blocks]

        text_parts = []
        tool_calls = []
        finish_reason = msg.get("stopReason") or msg.get("finish_reason")

        for block in content_blocks:
            if not isinstance(block, dict):
                continue
            bt = block.get("type", "")
            if bt in ("text",):
                text_parts.append(block.get("text", ""))
            elif bt in ("thinking",):
                text_parts.append(block.get("thinking", ""))
            elif bt == "toolCall":
                tool_calls.append({
                    "id": block.get("id", ""),
                    "name": block.get("name", ""),
                    "arguments": block.get("arguments", {}),
                })

        content = "\n".join(text_parts)

        ts_str = msg.get("timestamp")
        ts = None
        if ts_str:
            if isinstance(ts_str, (int, float)):
                ts = datetime.fromtimestamp(ts_str / 1000, tz=timezone.utc) if ts_str > 1e12 else datetime.fromtimestamp(ts_str, tz=timezone.utc)
            elif isinstance(ts_str, str):
                ts = _parse_iso(ts_str)

        model = msg.get("model") or default_model

        messages.append(Message(
            role=role,
            content=content,
            timestamp=ts,
            tool_calls=tool_calls,
            finish_reason=finish_reason,
            model=model,
        ))

    return messages


def _parse_iso(ts_str: str) -> datetime | None:
    ts_str = ts_str.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(ts_str)
    except ValueError:
        return None
