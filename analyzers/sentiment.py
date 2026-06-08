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


_ensure_nltk_data()
_sia = SentimentIntensityAnalyzer()


def analyze(conversations: list[Conversation]) -> dict:
    """Analyze agent messages for sentiment polarity and subjectivity."""
    all_agent_scores = []
    all_subjectivity = []
    per_conversation = []
    polarity_buckets = Counter({"positive": 0, "neutral": 0, "negative": 0})

    for conv in conversations:
        agent_msgs = [m for m in conv.messages if m.role == "assistant"]
        scores = []
        subj_scores = []
        for m in agent_msgs:
            if not m.content.strip():
                continue
            s = _sia.polarity_scores(m.content)
            scores.append(s)
            all_agent_scores.append(s)
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
        "total_agent_messages": len(all_agent_scores),
    }
