"""Agent-facing tone analysis using language-aware pattern matching.

Every category targets agent (assistant) messages, not user messages.
The diary is about the agent, so we measure what the agent expresses.

Supports multiple languages via analyzers.lang_utils:
- Per-language regex pattern tables (English, Indonesian)
- Universal structural heuristics (emoji, punctuation, repeated chars)
- Automatic language detection via langdetect
"""

import re

from parsers.base import Conversation, Message
from analyzers.lang_utils import (
    detect_language,
    get_tone_patterns,
    match_tone_pattern,
    has_question_mark,
    has_exclamation,
    has_emoji,
    has_repeated_chars,
    count_all_caps_words,
)


def analyze(conversations: list[Conversation]) -> dict:
    # Detect language from assistant messages
    agent_texts = []
    for conv in conversations:
        for m in conv.messages:
            if m.role == "assistant" and m.content.strip():
                agent_texts.append(m.content)

    language = detect_language(agent_texts) if agent_texts else "en"
    patterns = get_tone_patterns(language)

    total_agent_msgs = 0
    total_chars = 0

    total_apologies = 0
    total_confidence = 0
    total_uncertainty = 0
    total_helpfulness = 0
    total_self_corrections = 0
    total_agent_questions = 0

    per_conversation = []

    for conv in conversations:
        agent_msgs = [m for m in conv.messages if m.role == "assistant"]
        c_apologies = 0
        c_confidence = 0
        c_uncertainty = 0
        c_helpfulness = 0
        c_self_corrections = 0
        c_questions = 0
        c_msgs = 0
        c_chars = 0

        for m in agent_msgs:
            txt = m.content.strip()
            if not txt:
                continue
            lower = txt.lower()

            c_msgs += 1
            c_chars += len(txt)

            # Language-specific pattern matching
            if match_tone_pattern(patterns, "apology", lower):
                c_apologies += 1
            # Also check universal apology emoji
            elif has_emoji(txt, "apology"):
                c_apologies += 1

            if match_tone_pattern(patterns, "confidence", lower):
                c_confidence += 1
            elif has_emoji(txt, "confidence"):
                c_confidence += 1

            if match_tone_pattern(patterns, "uncertainty", lower):
                c_uncertainty += 1
            elif has_emoji(txt, "uncertainty"):
                c_uncertainty += 1

            if match_tone_pattern(patterns, "helpfulness", lower):
                c_helpfulness += 1
            elif has_emoji(txt, "helpfulness"):
                c_helpfulness += 1

            if match_tone_pattern(patterns, "self_correction", lower):
                c_self_corrections += 1
            elif has_emoji(txt, "self_correction"):
                c_self_corrections += 1

            # Agent questions: pattern match + universal question mark
            if match_tone_pattern(patterns, "agent_question", lower):
                c_questions += 1
            elif has_question_mark(txt):
                c_questions += 1
            elif has_emoji(txt, "question"):
                c_questions += 1

            # Structural signals that supplement the above:
            # - Exclamation marks can indicate confidence/excitement
            if has_exclamation(txt) and not match_tone_pattern(patterns, "confidence", lower):
                # Lightweight confidence signal (at most once per message)
                if not has_emoji(txt, "uncertainty"):
                    pass  # exclamation alone is weak, let patterns decide

            # - Repeated chars can indicate emphasis (confidence or frustration)
            if has_repeated_chars(txt):
                # This signals emotional intensity but can't tell direction
                pass  # too ambiguous to assign to a category

        total_agent_msgs += c_msgs
        total_chars += c_chars
        total_apologies += c_apologies
        total_confidence += c_confidence
        total_uncertainty += c_uncertainty
        total_helpfulness += c_helpfulness
        total_self_corrections += c_self_corrections
        total_agent_questions += c_questions

        per_conversation.append({
            "id": conv.id,
            "source": conv.source,
            "language": language,
            "apologies": c_apologies,
            "confidence": c_confidence,
            "uncertainty": c_uncertainty,
            "helpfulness": c_helpfulness,
            "self_corrections": c_self_corrections,
            "questions": c_questions,
        })

    n = total_agent_msgs or 1
    avg_msg_len = round(total_chars / total_agent_msgs) if total_agent_msgs else 0

    confidence_net = round((total_confidence - total_uncertainty) / n, 3)

    return {
        "language": language,
        "apology_count": total_apologies,
        "apology_rate": round(total_apologies / n, 3),
        "confidence_count": total_confidence,
        "uncertainty_count": total_uncertainty,
        "confidence_net": confidence_net,
        "helpfulness_count": total_helpfulness,
        "helpfulness_rate": round(total_helpfulness / n, 3),
        "self_correction_count": total_self_corrections,
        "self_correction_rate": round(total_self_corrections / n, 3),
        "question_count": total_agent_questions,
        "question_rate": round(total_agent_questions / n, 3),
        "total_agent_messages": total_agent_msgs,
        "avg_message_length": avg_msg_len,
        "per_conversation": per_conversation,
    }
