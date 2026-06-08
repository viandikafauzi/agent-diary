"""Claude Code session parser.

Reads transcripts from ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
and the companion sessions-index.json for session-discovery metadata.

Format reference:
  https://github.com/vade-app/tjsonl/blob/main/spec/transcript-schema-spec.md

Discovery strategy:
  1. Prefer sessions-index.json (fast path — metadata without reading transcripts).
  2. When the index is missing (e.g. claude -p mode), fall back to scanning
     .jsonl files directly, peeking at the first line's timestamp to decide
     whether the session belongs to the target date.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from .base import Conversation, Message

CLAUDE_PROJECTS_DIR = Path.home() / ".claude" / "projects"


def is_installed() -> bool:
    return CLAUDE_PROJECTS_DIR.is_dir()


def extract(date_str: str) -> list[Conversation]:
    target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    day_start = datetime(target_date.year, target_date.month, target_date.day, tzinfo=timezone.utc)
    day_end = datetime(target_date.year, target_date.month, target_date.day, 23, 59, 59, 999999, tzinfo=timezone.utc)

    conversations: list[Conversation] = []
    seen: set[str] = set()

    for project_dir in _project_dirs():
        index = _load_index(project_dir)

        if index:
            # Fast path: filter via the index entries
            for entry in index.get("entries", []):
                sid = entry.get("sessionId", "")
                if not sid or sid in seen:
                    continue
                ts = _entry_timestamp(entry)
                if not ts or not (day_start <= ts <= day_end):
                    continue
                seen.add(sid)
                raw_path = entry.get("fullPath", "")
                if raw_path:
                    p = Path(raw_path)
                    jsonl_path = str(p) if p.is_absolute() else str(project_dir / p)
                else:
                    jsonl_path = str(project_dir / f"{sid}.jsonl")
                conv = _parse_session(jsonl_path, entry, day_start, day_end)
                if conv:
                    conversations.append(conv)
        else:
            # Fallback: no index — scan .jsonl files directly, checking
            # if any timestamp falls within the target date range.
            for jsonl_file in sorted(project_dir.glob("*.jsonl")):
                sid = jsonl_file.stem
                if sid in seen:
                    continue
                if not _has_activity_on_date(jsonl_file, day_start, day_end):
                    continue
                seen.add(sid)
                # Synthesize a minimal index entry for _parse_session
                entry = {"sessionId": sid, "fullPath": str(jsonl_file)}
                conv = _parse_session(str(jsonl_file), entry, day_start, day_end)
                if conv:
                    conversations.append(conv)

    return conversations


# ── helpers ────────────────────────────────────────────────────────────

def _project_dirs():
    """Yield Paths for every project subdirectory under ~/.claude/projects/."""
    if not CLAUDE_PROJECTS_DIR.is_dir():
        return
    for entry in sorted(CLAUDE_PROJECTS_DIR.iterdir()):
        if entry.is_dir() and not entry.name.startswith("."):
            yield entry


def _load_index(project_dir: Path) -> dict | None:
    """Load sessions-index.json, returning None if missing or unreadable."""
    index_path = project_dir / "sessions-index.json"
    if not index_path.exists():
        return None
    try:
        with open(index_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def _peek_first_ts(path: Path) -> datetime | None:
    """Read .jsonl lines until one with a timestamp field is found.
    Returns the parsed timestamp, or None if no timestamped line exists."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            for raw in f:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    obj = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                ts = _parse_line_ts(obj)
                if ts is not None:
                    return ts
    except OSError:
        return None
    return None


def _has_activity_on_date(path: Path, day_start: datetime, day_end: datetime) -> bool:
    """Return True if any line in the file has a timestamp within [day_start, day_end]."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            for raw in f:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    obj = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                ts = _parse_line_ts(obj)
                if ts is not None and day_start <= ts <= day_end:
                    return True
    except OSError:
        pass
    return False


def _entry_timestamp(entry: dict) -> datetime | None:
    """Extract a datetime from the index entry (prefer created, fallback modified)."""
    for key in ("created", "modified"):
        raw = entry.get(key)
        if raw:
            ts = _parse_iso(raw)
            if ts:
                return ts
    return None


def _parse_session(
    jsonl_path: str, index_entry: dict, day_start: datetime, day_end: datetime
) -> Conversation | None:
    """Parse a single .jsonl transcript into a Conversation.

    The caller already decided this session is relevant via _peek_first_ts or
    the index — so we include *all* messages regardless of timestamp, keeping
    the conversation whole.  Filtering individual lines by a date window
    silently drops user messages that are just outside the boundary.
    """
    path = Path(jsonl_path)
    if not path.exists():
        return None

    lines = _read_jsonl(path)
    if not lines:
        return None

    session_id = index_entry.get("sessionId", path.stem)
    model = _extract_model(lines)
    messages = _build_messages(lines)
    if not messages:
        return None

    tool_calls = sum(1 for m in messages if m.tool_calls)
    first_ts = messages[0].timestamp
    last_ts = messages[-1].timestamp

    # End reason from the last assistant message
    end_reason = None
    for m in reversed(messages):
        if m.role == "assistant" and m.finish_reason:
            end_reason = m.finish_reason
            break

    # Cost: sum costUSD across all lines in the transcript
    cost = _sum_cost(lines)

    return Conversation(
        id=session_id,
        source="claude",
        model=model,
        started_at=first_ts,
        ended_at=last_ts,
        end_reason=end_reason,
        messages=messages,
        message_count=len(messages),
        tool_call_count=tool_calls,
        estimated_cost_usd=cost,
    )


def _read_jsonl(path: Path) -> list[dict]:
    """Read a .jsonl file, returning parsed line objects."""
    lines: list[dict] = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            for raw in f:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    lines.append(json.loads(raw))
                except json.JSONDecodeError:
                    continue
    except OSError:
        return []
    return lines


def _extract_model(lines: list[dict]) -> str | None:
    """Find the model name from the first assistant line."""
    for line in lines:
        if line.get("type") == "assistant":
            msg = line.get("message", {})
            if isinstance(msg, dict):
                return msg.get("model")
    return None


def _build_messages(
    lines: list[dict], day_start: datetime | None = None, day_end: datetime | None = None
) -> list[Message]:
    """Build Message objects from jsonl lines.

    When day_start/day_end are provided, lines outside that window are skipped.
    Omit both to include all lines.
    """
    messages: list[Message] = []

    for line in lines:
        ltype = line.get("type", "")
        ts = _parse_line_ts(line)
        if ts is None:
            continue
        if day_start and day_end and (ts < day_start or ts > day_end):
            continue

        if ltype == "assistant":
            msg = _build_assistant_message(line, ts)
            if msg:
                messages.append(msg)
        elif ltype == "user":
            msgs = _build_user_messages(line, ts)
            messages.extend(msgs)

    return messages


def _build_assistant_message(line: dict, ts: datetime) -> Message | None:
    """Build an assistant Message from an 'assistant' jsonl line."""
    msg = line.get("message", {})
    if not isinstance(msg, dict):
        return None

    content_blocks = msg.get("content", [])
    if not isinstance(content_blocks, list):
        content_blocks = []

    text_parts: list[str] = []
    tool_calls: list[dict] = []

    for block in content_blocks:
        if not isinstance(block, dict):
            continue
        bt = block.get("type", "")
        if bt == "text":
            text_parts.append(block.get("text", ""))
        elif bt == "thinking":
            text_parts.append(block.get("thinking", ""))
        elif bt == "tool_use":
            tool_calls.append({
                "id": block.get("id", ""),
                "name": block.get("name", ""),
                "arguments": block.get("input", {}),
            })

    content = "\n".join(text_parts)

    return Message(
        role="assistant",
        content=content,
        timestamp=ts,
        tool_calls=tool_calls,
        finish_reason=msg.get("stop_reason"),
        model=msg.get("model"),
    )


def _build_user_messages(line: dict, ts: datetime) -> list[Message]:
    """Build user Message(s) from a 'user' jsonl line.

    A user line may contain:
    - content as a plain string (the human's typed message)
    - content as a list of text blocks and/or tool_result blocks
      (tool output injected into the transcript)

    When content is a string we emit a single user Message.
    When content is a list we emit one Message per content block so
    tool results get distinct entries.
    """
    msg = line.get("message", {})
    if not isinstance(msg, dict):
        return []

    raw_content = msg.get("content", "")

    # Plain string → single user message (the common case for typed input)
    if isinstance(raw_content, str):
        text = raw_content.strip()
        if text:
            return [Message(role="user", content=text, timestamp=ts)]
        return []

    # List of content blocks
    if not isinstance(raw_content, list):
        return []

    messages: list[Message] = []

    for block in raw_content:
        if not isinstance(block, dict):
            continue
        bt = block.get("type", "")
        if bt == "text":
            messages.append(Message(
                role="user",
                content=block.get("text", ""),
                timestamp=ts,
            ))
        elif bt == "tool_result":
            result = block.get("content", "")
            if isinstance(result, list):
                # content can be an array of text blocks
                parts = []
                for r in result:
                    if isinstance(r, dict) and r.get("type") == "text":
                        parts.append(r.get("text", ""))
                    elif isinstance(r, str):
                        parts.append(r)
                result = "\n".join(parts)
            elif not isinstance(result, str):
                result = json.dumps(result) if result else ""

            messages.append(Message(
                role="toolResult",
                content=str(result),
                timestamp=ts,
                tool_name=block.get("tool_use_id", ""),
            ))

    return messages


def _parse_line_ts(line: dict) -> datetime | None:
    """Extract timestamp from a jsonl line."""
    raw = line.get("timestamp")
    if raw is None:
        return None
    return _parse_iso(str(raw))


def _parse_iso(ts_str: str) -> datetime | None:
    """Parse ISO-8601 to UTC datetime.  Returns None on unparseable input."""
    if not ts_str:
        return None
    try:
        ts_str = ts_str.replace("Z", "+00:00")
        return datetime.fromisoformat(ts_str)
    except (ValueError, TypeError):
        return None


def _sum_cost(lines: list[dict]) -> float:
    """Sum costUSD across all lines, falling back to 0."""
    total = 0.0
    for line in lines:
        cost = line.get("costUSD")
        if isinstance(cost, (int, float)):
            total += float(cost)
    return round(total, 6)
