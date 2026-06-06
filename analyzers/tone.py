from collections import Counter

from parsers.base import Conversation, Message

GRATITUDE_WORDS = [
    "thanks", "thank you", "thx", "appreciate", "grateful", "perfect", "exactly",
    "great", "awesome", "nice", "love it", "good job", "well done", "brilliant",
    "fantastic", "wonderful", "beautiful", "that works", "it works", "worked",
    "correct", "right", "yes", "yep",
]

FRUSTRATION_WORDS = [
    "no", "wrong", "not what i", "that's not", "incorrect", "doesn't work",
    "didn't work", "still broken", "ugh", "ughh", "damn", "damnit", "stupid",
    "annoying", "useless", "terrible", "awful", "bad", "horrible",
    "again", "still", "not yet", "try again", "redo", "re-do", "nope",
    "actually", "i meant", "what i meant", "i said",
]

POLITE_WORDS = [
    "please", "could you", "would you", "can you", "mind", "if you don't mind",
    "i'd like", "i would like", "kindly", "if possible",
]

DIRECTIVE_WORDS = [
    "do this", "make it", "create", "build", "implement", "write", "add",
    "fix", "change", "update", "remove", "delete", "run", "execute",
    "find", "search", "check", "verify", "test", "deploy",
]

QUESTION_MARKERS = ["?", "what", "how", "why", "when", "where", "who", "which", "can you", "could you", "would you"]


def analyze(conversations: list[Conversation]) -> dict:
    total_user_msgs = 0
    gratitude_count = 0
    frustration_count = 0
    polite_count = 0
    directive_count = 0
    question_count = 0
    total_user_chars = 0

    per_conversation = []

    for conv in conversations:
        c_gratitude = 0
        c_frustration = 0
        c_polite = 0
        c_directive = 0
        c_question = 0
        c_msgs = 0
        c_chars = 0

        for m in conv.messages:
            if m.role != "user":
                continue
            txt = m.content.lower().strip()
            if not txt:
                continue

            c_msgs += 1
            c_chars += len(txt)

            if any(w in txt for w in GRATITUDE_WORDS):
                c_gratitude += 1
            if any(w in txt for w in FRUSTRATION_WORDS):
                c_frustration += 1
            if any(w in txt for w in POLITE_WORDS):
                c_polite += 1
            if any(w in txt for w in DIRECTIVE_WORDS):
                c_directive += 1
            if any(marker in txt for marker in QUESTION_MARKERS):
                c_question += 1

        total_user_msgs += c_msgs
        gratitude_count += c_gratitude
        frustration_count += c_frustration
        polite_count += c_polite
        directive_count += c_directive
        question_count += c_question
        total_user_chars += c_chars

        per_conversation.append({
            "id": conv.id,
            "source": conv.source,
            "gratitude": c_gratitude,
            "frustration": c_frustration,
            "polite": c_polite,
            "directive": c_directive,
            "questions": c_question,
        })

    avg_msg_len = round(total_user_chars / total_user_msgs) if total_user_msgs else 0

    gfr = 0.0
    if frustration_count > 0:
        gfr = round(gratitude_count / frustration_count, 2)
    elif gratitude_count > 0:
        gfr = gratitude_count

    return {
        "gratitude_count": gratitude_count,
        "frustration_count": frustration_count,
        "polite_count": polite_count,
        "directive_count": directive_count,
        "question_count": question_count,
        "total_user_messages": total_user_msgs,
        "avg_message_length": avg_msg_len,
        "gratitude_frustration_ratio": gfr,
        "per_conversation": per_conversation,
    }
