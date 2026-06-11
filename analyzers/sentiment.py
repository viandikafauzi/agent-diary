import nltk
from nltk.sentiment import SentimentIntensityAnalyzer
from textblob import TextBlob
from collections import Counter

from parsers.base import Conversation, Message


def _ensure_nltk_data():
    for resource in ("vader_lexicon", "punkt", "punkt_tab", "averaged_perceptron_tagger"):
        try:
            nltk.data.find(resource)
        except LookupError:
            nltk.download(resource, quiet=True)


_sia: SentimentIntensityAnalyzer | None = None


def _ensure_nltk():
    global _sia
    if _sia is not None:
        return
    _ensure_nltk_data()
    _sia = SentimentIntensityAnalyzer()


def analyze(conversations: list[Conversation]) -> dict:
    """Analyze agent messages for sentiment polarity and subjectivity."""
    _ensure_nltk()
    all_agent_scores = []
    all_subjectivity = []
    per_conversation = []
    polarity_buckets = Counter({"positive": 0, "neutral": 0, "negative": 0})

    per_message = []

    for conv in conversations:
        scores = []
        subj_scores = []
        for msg_idx, m in enumerate(conv.messages):
            if m.role != "assistant" or not m.content.strip():
                continue
            s = _sia.polarity_scores(m.content)
            scores.append(s)
            all_agent_scores.append(s)

            compound = round(s["compound"], 3)
            if compound >= 0.05:
                polarity_label = "positive"
            elif compound <= -0.05:
                polarity_label = "negative"
            else:
                polarity_label = "neutral"

            per_message.append({
                "conv_id": conv.id,
                "source": conv.source,
                "msg_idx": msg_idx,
                "content_preview": m.content[:150] + ("..." if len(m.content) > 150 else ""),
                "compound": compound,
                "polarity_label": polarity_label,
            })

            try:
                blob = TextBlob(m.content)
                subj_scores.append(blob.sentiment.subjectivity)
            except Exception:
                pass

        if scores:
            avg_compound = sum(s["compound"] for s in scores) / len(scores)
            avg_subj = round(sum(subj_scores) / len(subj_scores), 3) if subj_scores else 0.0
            per_conversation.append({
                "id": conv.id,
                "source": conv.source,
                "avg_compound": round(avg_compound, 3),
                "avg_subjectivity": avg_subj,
                "message_count": len(scores),
            })
            all_subjectivity.extend(subj_scores)

            if avg_compound >= 0.05:
                polarity_buckets["positive"] += 1
            elif avg_compound <= -0.05:
                polarity_buckets["negative"] += 1
            else:
                polarity_buckets["neutral"] += 1

    overall_compound = 0.0
    if all_agent_scores:
        overall_compound = sum(s["compound"] for s in all_agent_scores) / len(all_agent_scores)

    overall_subjectivity = 0.0
    if all_subjectivity:
        overall_subjectivity = sum(all_subjectivity) / len(all_subjectivity)

    dominant = "neutral"
    if overall_compound >= 0.05:
        dominant = "positive"
    elif overall_compound <= -0.05:
        dominant = "negative"

    return {
        "overall_compound": round(overall_compound, 3),
        "overall_subjectivity": round(overall_subjectivity, 3),
        "dominant_tone": dominant,
        "polarity_distribution": dict(polarity_buckets),
        "per_conversation": per_conversation,
        "per_message": per_message,
        "total_agent_messages": len(all_agent_scores),
    }
