from nltk.sentiment import SentimentIntensityAnalyzer
from collections import Counter

from parsers.base import Conversation, Message

_sia = SentimentIntensityAnalyzer()


def analyze(conversations: list[Conversation]) -> dict:
    all_user_scores = []
    per_conversation = []
    polarity_buckets = Counter({"positive": 0, "neutral": 0, "negative": 0})

    for conv in conversations:
        user_msgs = [m for m in conv.messages if m.role == "user"]
        scores = []
        for m in user_msgs:
            if not m.content.strip():
                continue
            s = _sia.polarity_scores(m.content)
            scores.append(s)
            all_user_scores.append(s)

        if scores:
            avg_compound = sum(s["compound"] for s in scores) / len(scores)
            per_conversation.append({
                "id": conv.id,
                "source": conv.source,
                "avg_compound": round(avg_compound, 3),
                "message_count": len(scores),
            })

            if avg_compound >= 0.05:
                polarity_buckets["positive"] += 1
            elif avg_compound <= -0.05:
                polarity_buckets["negative"] += 1
            else:
                polarity_buckets["neutral"] += 1

    overall_compound = 0.0
    if all_user_scores:
        overall_compound = sum(s["compound"] for s in all_user_scores) / len(all_user_scores)

    dominant = "neutral"
    if overall_compound >= 0.05:
        dominant = "positive"
    elif overall_compound <= -0.05:
        dominant = "negative"

    return {
        "overall_compound": round(overall_compound, 3),
        "dominant_tone": dominant,
        "polarity_distribution": dict(polarity_buckets),
        "per_conversation": per_conversation,
        "total_user_messages": len(all_user_scores),
    }
