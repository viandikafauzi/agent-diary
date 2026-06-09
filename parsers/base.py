from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


def parse_iso(ts_str: str) -> datetime | None:
    if not ts_str:
        return None
    try:
        ts_str = ts_str.replace("Z", "+00:00")
        return datetime.fromisoformat(ts_str)
    except (ValueError, TypeError):
        return None


def day_range(date_str: str) -> tuple[datetime, datetime]:
    target = datetime.strptime(date_str, "%Y-%m-%d")
    start = target.replace(tzinfo=timezone.utc)
    end = target.replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=timezone.utc)
    return start, end


@dataclass
class Message:
    role: str
    content: str
    timestamp: Optional[datetime] = None
    tool_calls: list = field(default_factory=list)
    tool_name: Optional[str] = None
    finish_reason: Optional[str] = None
    model: Optional[str] = None
    token_count: Optional[int] = None


@dataclass
class Conversation:
    id: str
    source: str
    model: Optional[str]
    started_at: Optional[datetime]
    ended_at: Optional[datetime] = None
    end_reason: Optional[str] = None
    messages: list[Message] = field(default_factory=list)
    message_count: int = 0
    tool_call_count: int = 0
    estimated_cost_usd: float = 0.0
    total_tokens: int = 0
