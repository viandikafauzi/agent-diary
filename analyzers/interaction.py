from parsers.base import Conversation, Message

NEGATION_TRIGGERS = [
    "wrong", "nope", "incorrect", "actually", "i meant",
    "what i meant", "that's not", "don't do", "do not",
    "shouldn't", "should not", "try again", "redo", "re-do",
    "not yet", "not what i", "not correct", "not working",
    "doesn't work", "didn't work", "still broken", "not right",
]

EXIT_POSITIVE = [
    "thanks", "thank", "perfect", "great", "goodbye", "bye", "done",
    "that's all", "all good", "resolved", "/exit",
]

CLARIFICATION_QUESTION_MARKERS = [
    "what do you mean", "can you clarify", "could you clarify",
    "do you mean", "are you saying", "do you want me to",
    "would you like me to", "to confirm", "just to be clear",
    "let me make sure", "so you want", "is this what you",
    "am i understanding", "to clarify", "which one",
    "did you mean", "let me know if",
]


def analyze(conversations: list[Conversation]) -> dict:
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

        clarifications = 0
        for m in assistant_msgs:
            txt = m.content.lower().strip() if m.content else ""
            if not txt:
                continue
            if any(marker in txt for marker in CLARIFICATION_QUESTION_MARKERS):
                clarifications += 1

        corrections = _count_corrections(user_msgs)

        redo_count = _count_redos(conv.messages)

        exit_quality, exit_reason = _classify_exit(conv, user_msgs)

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


def _count_corrections(user_msgs: list[Message]) -> int:
    count = 0
    for m in user_msgs:
        txt = m.content.lower().strip()
        if any(trigger in txt for trigger in NEGATION_TRIGGERS):
            count += 1
    return count


def _count_redos(messages: list[Message]) -> int:
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


def _classify_exit(conv: Conversation, user_msgs: list[Message]) -> tuple[str, str]:
    if conv.end_reason:
        if conv.end_reason in ("stop", "end_turn", "done", "manual"):
            return "clean", conv.end_reason
        elif conv.end_reason in ("error", "timeout", "max_tokens", "aborted"):
            return "forced", conv.end_reason
        return "unknown", conv.end_reason

    if not user_msgs:
        return "dangling", "no_user_messages"

    last_user = user_msgs[-1].content.lower().strip()
    if any(marker in last_user for marker in EXIT_POSITIVE):
        return "clean", "positive_signoff"

    return "dangling", "no_clear_exit"
