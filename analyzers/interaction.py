"""Interaction quality analysis with multilingual support.

Measures session-level quality metrics:
- Correction rate (user pushback)
- Clarification rate (agent asking for clarity)
- Re-do rate (repeated tool calls)
- Exit quality (clean vs dangling)

Uses per-language pattern tables from analyzers.lang_utils
plus universal structural heuristics.
"""

from parsers.base import Conversation, Message
from analyzers.lang_utils import (
    detect_language,
    get_interaction_patterns,
    match_interaction_pattern,
    has_emoji,
    has_question_mark,
    has_exclamation,
)


def analyze(conversations: list[Conversation]) -> dict:
    # Detect language from user + assistant messages for interaction context
    all_texts = []
    for conv in conversations:
        for m in conv.messages:
            if m.content.strip():
                all_texts.append(m.content)

    language = detect_language(all_texts) if all_texts else "en"
    patterns = get_interaction_patterns(language)

    per_conversation = []
    total_turns = 0
    total_clarifications = 0
    total_corrections = 0
    total_sessions = len(conversations)
    clean_exits = 0
    dangling_exits = 0
    all_redo_counts = []
    end_reasons = []

    for conv in conversations:
        user_msgs = [m for m in conv.messages if m.role == "user"]
        assistant_msgs = [m for m in conv.messages if m.role == "assistant"]
        turns = len(user_msgs)

        clarifications = _count_clarifications(assistant_msgs, patterns)
        corrections = _count_corrections(user_msgs, patterns)

        redo_count = _count_redos(conv.messages)

        exit_quality, exit_reason = _classify_exit(conv, user_msgs, patterns)

        if exit_quality == "clean":
            clean_exits += 1
        elif exit_quality == "dangling":
            dangling_exits += 1

        total_turns += turns
        total_clarifications += clarifications
        total_corrections += corrections
        all_redo_counts.append(redo_count)
        end_reasons.append(exit_reason)

        per_conversation.append({
            "id": conv.id,
            "source": conv.source,
            "model": conv.model,
            "language": language,
            "turns": turns,
            "clarifications": clarifications,
            "corrections": corrections,
            "redos": redo_count,
            "exit_quality": exit_quality,
            "exit_reason": exit_reason,
            "tool_calls": conv.tool_call_count,
            "messages": conv.message_count,
        })

    avg_turns = round(total_turns / total_sessions, 1) if total_sessions else 0
    clarification_ratio = round(total_clarifications / total_turns, 2) if total_turns else 0
    correction_ratio = round(total_corrections / total_turns, 2) if total_turns else 0
    avg_redos = round(sum(all_redo_counts) / total_sessions, 1) if total_sessions else 0
    clean_exit_ratio = round(clean_exits / total_sessions, 2) if total_sessions else 0

    return {
        "language": language,
        "total_sessions": total_sessions,
        "total_turns": total_turns,
        "avg_turns_per_session": avg_turns,
        "total_clarifications": total_clarifications,
        "clarification_ratio": clarification_ratio,
        "total_corrections": total_corrections,
        "correction_ratio": correction_ratio,
        "avg_redos_per_session": avg_redos,
        "clean_exits": clean_exits,
        "dangling_exits": dangling_exits,
        "clean_exit_ratio": clean_exit_ratio,
        "per_conversation": per_conversation,
    }


def _count_corrections(user_msgs: list[Message], patterns: dict) -> int:
    """Count user messages that contain correction signals."""
    count = 0
    for m in user_msgs:
        txt = m.content.lower().strip()
        # Language-specific correction patterns
        if match_interaction_pattern(patterns, "correction", txt):
            count += 1
        # Universal: negative emoji
        elif has_emoji(txt, "negative"):
            count += 1
        # Universal: multiple exclamation marks suggest frustration
        elif txt.count("!") >= 2:
            count += 1
    return count


def _count_clarifications(assistant_msgs: list[Message], patterns: dict) -> int:
    """Count assistant messages that ask for clarification."""
    count = 0
    for m in assistant_msgs:
        txt = m.content.lower().strip() if m.content else ""
        if not txt:
            continue
        # Language-specific clarification patterns
        if match_interaction_pattern(patterns, "clarification_question", txt):
            count += 1
        # Universal: question mark (the agent is asking something)
        elif has_question_mark(txt):
            count += 1
        # Universal: confusion emoji
        elif has_emoji(txt, "question"):
            count += 1
    return count


def _count_redos(messages: list[Message]) -> int:
    """Count repeated tool calls (same tool name called more than once).

    This is structural and language-agnostic.
    """
    tool_names = []
    for m in messages:
        for tc in m.tool_calls:
            tool_names.append(tc.get("name", ""))
    seen = {}
    redos = 0
    for name in tool_names:
        if name in seen:
            redos += 1
        seen[name] = seen.get(name, 0) + 1
    return redos


def _classify_exit(
    conv: Conversation, user_msgs: list[Message], patterns: dict
) -> tuple[str, str]:
    """Determine exit quality using language-aware patterns."""
    if conv.end_reason:
        if conv.end_reason in ("stop", "end_turn", "done", "manual"):
            return "clean", conv.end_reason
        elif conv.end_reason in ("error", "timeout", "max_tokens", "aborted"):
            return "forced", conv.end_reason
        return "unknown", conv.end_reason

    if not user_msgs:
        return "dangling", "no_user_messages"

    last_user = user_msgs[-1].content.lower().strip()

    # Language-specific positive exit patterns
    if match_interaction_pattern(patterns, "exit_positive", last_user):
        return "clean", "positive_signoff"
    # Universal: gratitude emoji
    if has_emoji(last_user, "gratitude"):
        return "clean", "emoji_signoff"

    return "dangling", "no_clear_exit"
