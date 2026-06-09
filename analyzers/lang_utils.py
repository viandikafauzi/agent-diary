"""Language-aware pattern matching for tone & interaction analysis.

Provides:
- Language detection from message text
- Per-language pattern tables for English (en) and Indonesian (id)
- Universal structural/character-level heuristics that work across languages
- A match function that selects the right patterns based on detected language
"""

import re
from typing import Optional

# ── Language detection ────────────────────────────────────────────────


def detect_language(texts: list[str]) -> str:
    """Detect the dominant language from a collection of message texts.

    Falls back to 'en' if langdetect is not installed or detection fails.
    """
    try:
        from langdetect import detect, DetectorFactory

        DetectorFactory.seed = 0

        sample = " ".join(texts[:100])
        if len(sample.strip()) < 10:
            return "en"
        return detect(sample)
    except ImportError:
        return "en"
    except Exception:
        return "en"


# ── Regex-based tone patterns (word-boundary aware) ───────────────────
# These are used by analyzers/tone.py via re.search()

EN_TONE = {
    "apology": [
        r"\bsorry\b", r"\bapologi[sz]e\b", r"\bmy\s+mistake\b", r"\bmy\s+fault\b",
        r"\bI\s+was\s+wrong\b", r"\bI\s+apologi[sz]e\b", r"\bmy\s+bad\b",
        r"\bthat\s+was\s+incorrect\b", r"\bI\s+messed\s+up\b",
        r"\byou\s+are\s+right\b", r"\byou're\s+right\b", r"\bgood\s+catch\b",
    ],
    "confidence": [
        r"\bdefinitely\b", r"\bcertainly\b", r"\bI\s+am\s+sure\b", r"\bI'm\s+sure\b",
        r"\bclearly\b", r"\bobviously\b", r"\bwithout\s+doubt\b", r"\babsolutely\b",
        r"\bindeed\b", r"\bexactly\b", r"\bprecisely\b", r"\bthat\s+is\s+correct\b",
        r"\bthat's\s+correct\b", r"\bno\s+problem\b",
    ],
    "uncertainty": [
        r"\bmaybe\b", r"\bperhaps\b", r"\bI\s+think\b", r"\bnot\s+sure\b",
        r"\bmight\s+be\b", r"\bcould\s+be\b", r"\bpossibly\b", r"\bprobably\b",
        r"\bI\s+believe\b", r"\bit\s+seems\b", r"\bappears?\b", r"\bI\s+guess\b",
        r"\bunsure\b", r"\bunclear\b", r"\bI\s+don't\s+know\b", r"\bI\s+dont\s+know\b",
        r"\bI\s+would\s+guess\b", r"\bsounds?\s+like\b",
    ],
    "helpfulness": [
        r"\blet\s+me\b", r"\bI\s+can\b", r"\bI'll\b", r"\bI\s+will\b",
        r"\bhere's\b", r"\bhere\s+is\b", r"\byou\s+can\b", r"\bwould\s+you\s+like\b",
        r"\blet's\b", r"\bI\s+recommend\b", r"\bI\s+suggest\b", r"\bfeel\s+free\b",
        r"\bhappy\s+to\b", r"\bglad\s+to\b", r"\byou're\s+welcome\b",
        r"\bI\s+will\s+help\b", r"\bI\s+can\s+help\b", r"\bhere\s+you\s+go\b",
        r"\bdid\s+that\s+help\b", r"\bdoes\s+that\s+help\b",
    ],
    "self_correction": [
        r"\bactually\b", r"\bwait\b", r"\blet\s+me\s+reconsider\b",
        r"\bon\s+second\s+thought\b", r"\brather\b", r"\bI\s+mean\b",
        r"\bscratch\s+that\b", r"\blet\s+me\s+rephrase\b", r"\binstead\b",
        r"\bcorrection\b", r"\bI\s+should\s+have\b",
        r"\bthat's\s+not\s+right\b", r"\blet\s+me\s+fix\b", r"\bhold\s+on\b",
        r"\bI\s+misread\b", r"\bI\s+misunderstood\b",
    ],
    "agent_question": [
        r"\bwhat\b", r"\bhow\b", r"\bwhy\b", r"\bwhen\b", r"\bwhere\b",
        r"\bwho\b", r"\bwhich\b", r"\bcan\s+you\b", r"\bcould\s+you\b",
        r"\bwould\s+you\b", r"\bdo\s+you\b", r"\bdoes\s+that\b",
        r"\bis\s+that\b", r"\bare\s+you\b", r"\bshall\s+I\b",
        r"\bwould\s+you\s+like\b", r"\bdo\s+you\s+want\b",
    ],
}

ID_TONE = {
    "apology": [
        r"\bmaaf\b", r"\bmaafkan\b", r"\bminta\s+maaf\b",
        r"\bsaya\s+salah\b", r"\baku\s+salah\b",
        r"\bkesalahan\w*\b", r"\bsalah\s+saya\b",
        r"\bseharusnya\b", r"\bsepertinya\s+salah\b",
        r"\bmaaf\s+ya\b", r"\boh\s+maaf\b",
    ],
    "confidence": [
        r"\btentu\b", r"\btentunya\b", r"\bpasti\b", r"\byakin\b",
        r"\bjelas\b", r"\b100%\b", r"\bsudah\s+pasti\b",
        r"\bdengan\s+yakin\b", r"\bgampang\b", r"\bmudah\b",
        r"\bsaya\s+yakin\b", r"\baku\s+yakin\b",
        r"\btidak\s+ada\s+masalah\b",
    ],
    "uncertainty": [
        r"\bmungkin\b", r"\bbarangkali\b", r"\bsepertinya\b", r"\bkayaknya\b",
        r"\bkurang\s+yakin\b", r"\bbelum\s+tahu\b", r"\btidak\s+tahu\b",
        r"\bgak\s+tahu\b", r"\bnggak\s+tahu\b", r"\bragu\b",
        r"\bkurang\s+tau\b", r"\bbisa\s+jadi\b", r"\btampaknya\b",
        r"\baku\s+pikir\b", r"\bsaya\s+pikir\b",
    ],
    "helpfulness": [
        r"\bbiar\s+saya\b", r"\bsaya\s+bisa\b", r"\baku\s+bisa\b",
        r"\bsaya\s+akan\b", r"\baku\s+akan\b", r"\bberikut\b",
        r"\bini\s+dia\b", r"\bkamu\s+bisa\b", r"\banda\s+bisa\b",
        r"\bmari\b", r"\bsaya\s+sarankan\b", r"\bsaya\s+rekomendasikan\b",
        r"\bsilakan\b", r"\bsilahkan\b", r"\bsenang\s+membantu\b",
        r"\bdengan\s+senang\s+hati\b", r"\bsama-sama\b",
        r"\bsaya\s+akan\s+membantu\b", r"\baku\s+akan\s+membantu\b",
        r"\bapakah\s+membantu\b",
    ],
    "self_correction": [
        r"\bsebenarnya\b", r"\btunggu\b", r"\bentar\b",
        r"\bmaksud\w*\s+saya\b", r"\blupakan\b",
        r"\bbiar\s+saya\s+ulang\b", r"\bganti\b",
        r"\boh\s+iya\b", r"\bmaksudku\b", r"\bmaksud\s+saya\b",
        r"\bbiar\s+saya\s+perbaiki\b", r"\bsaya\s+keliru\b",
        r"\bsaya\s+salah\s+baca\b", r"\bbukan\s+begitu\b",
    ],
    "agent_question": [
        r"\bapa\b", r"\bbagaimana\b", r"\bmengapa\b", r"\bkenapa\b",
        r"\bkapan\b", r"\bdimana\b", r"\bsiapa\b", r"\byang\s+mana\b",
        r"\bbisakah\b", r"\bbisa\s+kamu\b", r"\bbisa\s+anda\b",
        r"\bapakah\b", r"\bapakah\s+itu\b",
        r"\bapakah\s+kamu\b", r"\bapakah\s+anda\b",
        r"\bbingung\b", r"\bmaukah\b",
    ],
}

# ── Simple substring interaction patterns (used by analyzers/interaction.py) ─

EN_INTERACTION = {
    "correction": [
        "wrong", "nope", "incorrect", "actually", "i meant",
        "what i meant", "that's not", "don't do", "do not",
        "shouldn't", "should not", "try again", "redo", "re-do",
        "not yet", "not what i", "not correct", "not working",
        "doesn't work", "didn't work", "still broken", "not right",
    ],
    "exit_positive": [
        "thanks", "thank", "perfect", "great", "goodbye", "bye", "done",
        "that's all", "all good", "resolved", "/exit",
    ],
    "clarification_question": [
        "what do you mean", "can you clarify", "could you clarify",
        "do you mean", "are you saying", "do you want me to",
        "would you like me to", "to confirm", "just to be clear",
        "let me make sure", "so you want", "is this what you",
        "am i understanding", "to clarify", "which one",
        "did you mean", "let me know if",
    ],
}

ID_INTERACTION = {
    "correction": [
        "salah", "bukan", "bukan itu", "maksudnya", "seharusnya",
        "bukan begitu", "jangan", "coba lagi", "ulang", "ulangi",
        "belum", "bukan ini", "salah semua", "masih salah",
        "tidak benar", "nggak", "gak", "tidak sesuai",
        "bukan gitu", "salah lagi",
    ],
    "exit_positive": [
        "makasih", "terima kasih", "terimakasih", "thanks", "thank",
        "sempurna", "bagus", "hebat", "mantap", "oke", "ok",
        "selesai", "sudah", "cukup", "done", "bye", "dadah",
        "baik terima kasih", "baiklah",
    ],
    "clarification_question": [
        "maksud kamu", "maksud anda", "apa yang kamu maksud",
        "bisa dijelaskan", "bisa klarifikasi", "apakah kamu mengatakan",
        "apakah maksudmu", "apakah anda mengatakan",
        "apakah kamu mau", "untuk memastikan", "biar jelas",
        "jadi kamu mau", "apakah ini yang", "apakah saya memahami",
        "untuk klarifikasi", "yang mana", "tolong jelaskan",
    ],
}

# ── Pattern selection ─────────────────────────────────────────────────

LANGUAGE_TONE_PATTERNS: dict[str, dict[str, list[str]]] = {
    "en": EN_TONE,
    "id": ID_TONE,
    "ms": ID_TONE,  # Malay shares most patterns with Indonesian
}

LANGUAGE_INTERACTION_PATTERNS: dict[str, dict[str, list[str]]] = {
    "en": EN_INTERACTION,
    "id": ID_INTERACTION,
    "ms": ID_INTERACTION,
}


def get_tone_patterns(language: str) -> dict[str, list[str]]:
    """Return regex patterns for tone analysis in the given language.

    Falls back to English if the language is unsupported.
    """
    return LANGUAGE_TONE_PATTERNS.get(language, EN_TONE)


def get_interaction_patterns(language: str) -> dict[str, list[str]]:
    """Return substring patterns for interaction analysis in the given language.

    Falls back to English if the language is unsupported.
    """
    return LANGUAGE_INTERACTION_PATTERNS.get(language, EN_INTERACTION)


# ── Universal structural / character-level heuristics ─────────────────
# These work across languages regardless of vocabulary.

# Emoji that carry tone/interaction signals
TONE_EMOJI = {
    "apology": {"😅", "😓", "😔", "🙏", "😬", "🥺"},
    "confidence": {"💪", "🔥", "✅", "✔️", "🎯"},
    "uncertainty": {"🤔", "😕", "🤷", "🤷‍♂️", "🤷‍♀️", "🧐"},
    "helpfulness": {"👍", "👌", "🙌", "✨", "💡", "😊"},
    "self_correction": {"🔄", "✏️", "📝"},
    "positive": {"😊", "👍", "🎉", "✅", "🙌", "💯", "🔥", "✨"},
    "negative": {"😞", "😠", "😤", "👎", "❌", "💀"},
    "question": {"❓", "❔", "🤔"},
    "gratitude": {"🙏", "🙏🏻", "🙏🏼", "😊"},
}


def has_question_mark(text: str) -> bool:
    """Universal: message contains a question mark."""
    return "?" in text


def has_exclamation(text: str) -> bool:
    """Universal: message contains an exclamation mark."""
    return "!" in text


def has_repeated_chars(text: str) -> bool:
    """Universal: detect repeated characters signalling emotion (e.g. 'noooo', 'whaat')."""
    return bool(re.search(r"(.)\1{3,}", text))


def has_emoji(text: str, category: str) -> bool:
    """Check if the text contains any emoji from the given category."""
    emojis = TONE_EMOJI.get(category, set())
    for ch in text:
        if ch in emojis:
            return True
    # Also check for multi-char emoji sequences
    for emo in emojis:
        if len(emo) > 1 and emo in text:
            return True
    return False


def count_all_caps_words(text: str) -> int:
    """Count words that are entirely uppercase (≥2 chars), excluding the first word of a sentence."""
    words = text.split()
    count = 0
    for i, w in enumerate(words):
        w_clean = w.strip(".!?\"'(),;:")
        if len(w_clean) >= 2 and w_clean.isupper():
            # Skip the very first word (could be 'I' or start of sentence)
            if i == 0 and len(w_clean) == 1:
                continue
            count += 1
    return count


# ── Convenience matcher ───────────────────────────────────────────────

def match_tone_pattern(patterns: dict[str, list[str]], category: str, text: str) -> bool:
    """Check if *any* regex pattern in the given category matches the text."""
    pats = patterns.get(category, [])
    for p in pats:
        if re.search(p, text, re.IGNORECASE):
            return True
    return False


def match_interaction_pattern(patterns: dict[str, list[str]], category: str, text: str) -> bool:
    """Check if *any* substring pattern in the given category appears in the text."""
    pats = patterns.get(category, [])
    for p in pats:
        if p in text:
            return True
    return False
