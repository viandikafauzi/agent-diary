import sqlite3
import json
from datetime import datetime, timezone
from pathlib import Path

from .base import Conversation, Message

HERMES_DB = Path.home() / ".hermes" / "state.db"


def is_installed() -> bool:
    return HERMES_DB.exists()


def extract(date_str: str) -> list[Conversation]:
    target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    day_start = datetime(target_date.year, target_date.month, target_date.day, tzinfo=timezone.utc).timestamp()
    day_end = datetime(target_date.year, target_date.month, target_date.day, 23, 59, 59, tzinfo=timezone.utc).timestamp()

    conn = sqlite3.connect(str(HERMES_DB))
    conn.row_factory = sqlite3.Row

    sessions = conn.execute(
        "SELECT * FROM sessions WHERE started_at >= ? AND started_at <= ? ORDER BY started_at",
        (day_start, day_end)
    ).fetchall()

    conversations = []
    for s in sessions:
        msgs = conn.execute(
            "SELECT * FROM messages WHERE session_id = ? AND active = 1 ORDER BY timestamp",
            (s["id"],)
        ).fetchall()

        messages = []
        for m in msgs:
            content = m["content"] or ""
            if m["role"] == "tool" and content.startswith("{"):
                try:
                    parsed = json.loads(content)
                    content = parsed.get("output", content)
                except json.JSONDecodeError:
                    pass

            tool_calls = []
            if m["tool_calls"]:
                try:
                    tool_calls = json.loads(m["tool_calls"])
                    if not isinstance(tool_calls, list):
                        tool_calls = [tool_calls]
                except json.JSONDecodeError:
                    pass

            ts = datetime.fromtimestamp(m["timestamp"], tz=timezone.utc) if m["timestamp"] else None

            messages.append(Message(
                role=m["role"],
                content=content,
                timestamp=ts,
                tool_calls=tool_calls,
                tool_name=m["tool_name"],
                finish_reason=m["finish_reason"],
                model=s["model"],
                token_count=m["token_count"],
            ))

        started = datetime.fromtimestamp(s["started_at"], tz=timezone.utc) if s["started_at"] else None
        ended = datetime.fromtimestamp(s["ended_at"], tz=timezone.utc) if s["ended_at"] else None

        total_tokens = sum(m.token_count or 0 for m in messages)

        conversations.append(Conversation(
            id=s["id"],
            source="hermes",
            model=s["model"],
            started_at=started,
            ended_at=ended,
            end_reason=s["end_reason"],
            messages=messages,
            message_count=s["message_count"] or len(messages),
            tool_call_count=s["tool_call_count"] or 0,
            estimated_cost_usd=s["estimated_cost_usd"] or 0.0,
            total_tokens=total_tokens,
        ))

    conn.close()
    return conversations
