"""OpenCode session parser.

Reads sessions from the OpenCode SQLite database at
~/.local/share/opencode/opencode.db.

Session data model:
  - session table: id, title, model (JSON), agent, time_created/updated (ms),
    cost, tokens_input/output/reasoning
  - message table: id, session_id, time_created/updated (ms), data (JSON)
  - part table: id, message_id, session_id, time_created/updated (ms), data (JSON)

Message data JSON:
  - User messages: {role: "user", time: {created: ms}, ...}
    Parts: {type: "text", text: "...", synthetic?: bool}
  - Assistant messages: {role: "assistant", modelID, providerID, time: {created: ms},
    finish?: {reason}, cost, tokens, ...}
    Parts: {type: "step-start"}, {type: "reasoning", text}, {type: "text", text},
    {type: "tool", tool, callID, state}, {type: "step-finish", reason, tokens, cost}
"""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .base import Conversation, Message, day_range

OPENCODE_DIR = Path.home() / ".local" / "share" / "opencode"
OPENCODE_DB = OPENCODE_DIR / "opencode.db"


def is_installed() -> bool:
    return OPENCODE_DB.exists()


def extract(date_str: str) -> list[Conversation]:
    day_start, day_end = day_range(date_str)
    day_start_ms = int(day_start.timestamp() * 1000)
    day_end_ms = int(day_end.timestamp() * 1000)

    if not is_installed():
        return []

    with sqlite3.connect(str(OPENCODE_DB)) as conn:
        conn.row_factory = sqlite3.Row

        sessions = conn.execute(
            """SELECT id, title, model, agent, time_created, time_updated,
                      cost, tokens_input, tokens_output, tokens_reasoning
               FROM session
               WHERE time_created >= ? AND time_created <= ?
               ORDER BY time_created""",
            (day_start_ms, day_end_ms),
        ).fetchall()

        conversations = []
        for s in sessions:
            messages = _build_messages(conn, s["id"])
            if not messages:
                continue

            model = _parse_model(s["model"])
            started_at = datetime.fromtimestamp(s["time_created"] / 1000, tz=timezone.utc)
            ended_at = datetime.fromtimestamp(s["time_updated"] / 1000, tz=timezone.utc)
            end_reason = _get_end_reason(messages)

            tool_call_count = sum(1 for m in messages if m.tool_calls)
            total_tokens = (
                (s["tokens_input"] or 0)
                + (s["tokens_output"] or 0)
                + (s["tokens_reasoning"] or 0)
            )

            conversations.append(
                Conversation(
                    id=s["id"],
                    source="opencode",
                    model=model,
                    started_at=started_at,
                    ended_at=ended_at,
                    end_reason=end_reason,
                    messages=messages,
                    message_count=len(messages),
                    tool_call_count=tool_call_count,
                    estimated_cost_usd=s["cost"] or 0.0,
                    total_tokens=total_tokens,
                    tokens_input=s["tokens_input"] or 0,
                    tokens_output=s["tokens_output"] or 0,
                    tokens_reasoning=s["tokens_reasoning"] or 0,
                )
            )

    return conversations


# ── helpers ────────────────────────────────────────────────────────────


def _parse_model(model_json: str | None) -> str | None:
    """Extract a human-readable model name from the JSON model field."""
    if not model_json:
        return None
    try:
        data = json.loads(model_json)
        return data.get("id") or f"{data.get('providerID','?')}/{data.get('modelID','?')}"
    except (json.JSONDecodeError, TypeError):
        return model_json


def _build_messages(conn: sqlite3.Connection, session_id: str) -> list[Message]:
    cursor = conn.execute(
        "SELECT * FROM message WHERE session_id = ? ORDER BY time_created",
        (session_id,),
    )
    messages: list[Message] = []
    for r in cursor.fetchall():
        data = json.loads(r["data"])
        role = data.get("role", "")

        # Fetch parts for this message
        parts = _fetch_parts(conn, r["id"])

        if role == "user":
            msgs = _build_user_messages(data, parts)
            messages.extend(msgs)
        elif role == "assistant":
            msg = _build_assistant_message(data, parts)
            if msg:
                messages.append(msg)

    return messages


def _fetch_parts(conn: sqlite3.Connection, message_id: str) -> list[dict]:
    cursor = conn.execute(
        "SELECT * FROM part WHERE message_id = ? ORDER BY time_created",
        (message_id,),
    )
    return [json.loads(p["data"]) for p in cursor.fetchall()]


def _build_user_messages(data: dict, parts: list[dict]) -> list[Message]:
    """Build user Message(s) from a user message row.

    Only non-synthetic text parts represent actual user input.
    Synthetic text parts (e.g. "The following tool was executed by the user")
    are skipped — they are not real user utterances.
    """
    ts = _extract_timestamp(data)
    if ts is None:
        return []

    messages: list[Message] = []
    for p in parts:
        if p.get("type") != "text":
            continue
        if p.get("synthetic"):
            continue
        text = p.get("text", "").strip()
        if text:
            messages.append(Message(role="user", content=text, timestamp=ts))

    return messages


def _build_assistant_message(data: dict, parts: list[dict]) -> Message | None:
    """Build an assistant Message from message data and its parts."""
    ts = _extract_timestamp(data)
    if ts is None:
        return None

    text_parts: list[str] = []
    tool_calls: list[dict] = []
    finish_reason: str | None = None
    token_count: int | None = None

    has_text_or_reasoning_or_tool = False

    for p in parts:
        ptype = p.get("type", "")

        if ptype == "text":
            has_text_or_reasoning_or_tool = True
            text_parts.append(p.get("text", ""))
        elif ptype == "reasoning":
            has_text_or_reasoning_or_tool = True
            text_parts.append(p.get("text", ""))
        elif ptype == "tool":
            has_text_or_reasoning_or_tool = True
            tool_calls.append({
                "id": p.get("callID", ""),
                "name": p.get("tool", ""),
                "arguments": p.get("state", {}).get("input", {}),
            })
        elif ptype == "step-finish":
            if not finish_reason:
                finish_reason = p.get("reason", "")
            tokens = p.get("tokens")
            if isinstance(tokens, dict) and token_count is None:
                token_count = tokens.get("total")

    # Also check the data-level finish field
    finish = data.get("finish")
    if isinstance(finish, dict) and finish.get("reason"):
        finish_reason = finish["reason"]

    # If the message has no text/reasoning/tool parts, skip it
    if not has_text_or_reasoning_or_tool:
        # Still create a message if we have some metadata? No.
        return None

    content = "\n".join(text_parts)

    # Model from message-level metadata
    model = None
    model_id = data.get("modelID")
    provider_id = data.get("providerID")
    if model_id:
        model = model_id
        if provider_id:
            model = f"{provider_id}/{model_id}"

    return Message(
        role="assistant",
        content=content,
        timestamp=ts,
        tool_calls=tool_calls,
        finish_reason=finish_reason,
        model=model,
        token_count=token_count,
    )


def _extract_timestamp(data: dict) -> datetime | None:
    """Extract datetime from the message-level time.created (milliseconds)."""
    time_data = data.get("time")
    if isinstance(time_data, dict):
        created = time_data.get("created")
        if isinstance(created, (int, float)):
            return datetime.fromtimestamp(created / 1000, tz=timezone.utc)
    return None


def _get_end_reason(messages: list[Message]) -> str | None:
    """Derive end_reason from the last assistant message's finish_reason."""
    for m in reversed(messages):
        if m.role == "assistant" and m.finish_reason:
            return m.finish_reason
    return None
