from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


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
