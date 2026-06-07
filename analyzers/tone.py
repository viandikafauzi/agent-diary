"""Agent-facing tone analysis using regex word-boundary matching.

Every category targets agent (assistant) messages, not user messages.
The diary is about the agent, so we measure what the agent expresses.
"""

import re

from parsers.base import Conversation, Message

# ── Agent behaviour patterns ──────────────────────────────────────────
# All patterns use raw regex with \b boundaries and \s+ for inter-word
# whitespace.  Compiled once at module level.

_APOLOGY = [
    r"\bsorry\b", r"\bapologi[sz]e\b", r"\bmy\s+mistake\b", r"\bmy\s+fault\b",
    r"\bI\s+was\s+wrong\b", r"\bI\s+apologi[sz]e\b", r"\bmy\s+bad\b",
    r"\bthat\s+was\s+incorrect\b", r"\bI\s+messed\s+up\b",
    r"\byou\s+are\s+right\b", r"\byou're\s+right\b", r"\bgood\s+catch\b",
]

_CONFIDENCE = [
    r"\bdefinitely\b", r"\bcertainly\b", r"\bI\s+am\s+sure\b", r"\bI'm\s+sure\b",
    r"\bclearly\b", r"\bobviously\b", r"\bwithout\s+doubt\b", r"\babsolutely\b",
    r"\bindeed\b", r"\bexactly\b", r"\bprecisely\b", r"\bthat\s+is\s+correct\b",
    r"\bthat's\s+correct\b", r"\bno\s+problem\b",
]

_UNCERTAINTY = [
    r"\bmaybe\b", r"\bperhaps\b", r"\bI\s+think\b", r"\bnot\s+sure\b",
    r"\bmight\s+be\b", r"\bcould\s+be\b", r"\bpossibly\b", r"\bprobably\b",
    r"\bI\s+believe\b", r"\bit\s+seems\b", r"\bappears?\b", r"\bI\s+guess\b",
    r"\bunsure\b", r"\bunclear\b", r"\bI\s+don't\s+know\b", r"\bI\s+dont\s+know\b",
    r"\bI\s+would\s+guess\b", r"\bsounds?\s+like\b",
]

_HELPFULNESS = [
    r"\blet\s+me\b", r"\bI\s+can\b", r"\bI'll\b", r"\bI\s+will\b",
    r"\bhere's\b", r"\bhere\s+is\b", r"\byou\s+can\b", r"\bwould\s+you\s+like\b",
    r"\blet's\b", r"\bI\s+recommend\b", r"\bI\s+suggest\b", r"\bfeel\s+free\b",
    r"\bhappy\s+to\b", r"\bglad\s+to\b", r"\byou're\s+welcome\b",
    r"\bI\s+will\s+help\b", r"\bI\s+can\s+help\b", r"\bhere\s+you\s+go\b",
    r"\bdid\s+that\s+help\b", r"\bdoes\s+that\s+help\b",
]

_SELF_CORRECTION = [
    r"\bactually\b", r"\bwait\b", r"\blet\s+me\s+reconsider\b",
    r"\bon\s+second\s+thought\b", r"\brather\b", r"\bI\s+mean\b",
    r"\bscratch\s+that\b", r"\blet\s+me\s+rephrase\b", r"\binstead\b",
    r"\bcorrection\b", r"\bI\s+should\s+have\b",
    r"\bthat's\s+not\s+right\b", r"\blet\s+me\s+fix\b", r"\bhold\s+on\b",
    r"\bI\s+misread\b", r"\bI\s+misunderstood\b",
]

_AGENT_QUESTION = [
    r"\bwhat\b", r"\bhow\b", r"\bwhy\b", r"\bwhen\b", r"\bwhere\b",
    r"\bwho\b", r"\bwhich\b", r"\bcan\s+you\b", r"\bcould\s+you\b",
    r"\bwould\s+you\b", r"\bdo\s+you\b", r"\bdoes\s+that\b",
    r"\bis\s+that\b", r"\bare\s+you\b", r"\bshall\s+I\b",
    r"\bwould\s+you\s+like\b", r"\bdo\s+you\s+want\b",
]


def _has_match(patterns: list[str], text: str) -> bool:
    """Return True if *any* pattern matches *text* (at-most-once per message)."""
    for p in patterns:
        if re.search(p, text, re.IGNORECASE):
            return True
    return False


def analyze(conversations: list[Conversation]) -> dict:
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

            if _has_match(_APOLOGY, lower):       c_apologies += 1
            if _has_match(_CONFIDENCE, lower):     c_confidence += 1
            if _has_match(_UNCERTAINTY, lower):    c_uncertainty += 1
            if _has_match(_HELPFULNESS, lower):    c_helpfulness += 1
            if _has_match(_SELF_CORRECTION, lower): c_self_corrections += 1
            if _has_match(_AGENT_QUESTION, lower):  c_questions += 1

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
