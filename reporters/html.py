import json
from datetime import datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from parsers.base import Conversation


TEMPLATE_DIR = Path(__file__).parent.parent / "templates"
OUTPUT_DIR = Path(__file__).parent.parent / "output"
_env = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)), autoescape=True)


def render(
    date_str: str,
    sentiment: dict,
    tone: dict,
    interaction: dict,
    conversations: list,
    sources: list[str],
    output_path: str | None = None,
) -> str:
    template = _env.get_template("report.html")

    notable = _find_notable(conversations, sentiment)

    total_conversations = len(conversations)
    total_messages = sum(c.message_count for c in conversations)
    total_tool_calls = sum(c.tool_call_count for c in conversations)
    total_cost = sum(c.estimated_cost_usd for c in conversations)

    satisfaction_index = _compute_satisfaction(tone, interaction)

    tone_total = sentiment.get("polarity_distribution", {})
    tone_max = max(sum(tone_total.values()), 1)

    sources_data = _build_sources_data(conversations, sentiment)
    conversations_json = _serialize_conversations(conversations)

    sources_with_sessions = sorted(set(c.source for c in conversations))

    html = template.render(
        date=date_str,
        generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        sources=sources,
        sources_with_sessions=sources_with_sessions,
        total_conversations=total_conversations,
        total_messages=total_messages,
        total_tool_calls=total_tool_calls,
        total_cost=round(total_cost, 4),
        sentiment=sentiment,
        tone=tone,
        interaction=interaction,
        satisfaction_index=satisfaction_index,
        tone_max=tone_max,
        sources_data=sources_data,
        conversations_json=conversations_json,
        notable=notable,
        conversations=conversations,
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out = output_path or str(OUTPUT_DIR / f"diary-{date_str}.html")
    with open(out, "w") as f:
        f.write(html)

    return out


def _compute_satisfaction(tone: dict, interaction: dict) -> dict:
    gfr = tone.get("gratitude_frustration_ratio", 0)
    clean_exit = interaction.get("clean_exit_ratio", 0)
    correction = interaction.get("correction_ratio", 0)

    score = 50.0
    score += min(gfr * 15, 25)
    score += clean_exit * 20
    score -= correction * 30
    score = max(0, min(100, score))

    label = "neutral"
    if score >= 70:
        label = "satisfied"
    elif score >= 50:
        label = "neutral"
    else:
        label = "frustrated"

    return {
        "score": round(score, 1),
        "label": label,
    }


def _find_notable(conversations: list, sentiment: dict) -> dict:
    scored = sentiment.get("per_conversation", [])
    if not scored:
        return {"best": [], "worst": []}

    sorted_by_score = sorted(scored, key=lambda x: x["avg_compound"], reverse=True)
    best = sorted_by_score[:3]
    worst = sorted(sorted_by_score, key=lambda x: x["avg_compound"])[:3]

    best_details = []
    for s in best:
        conv = next((c for c in conversations if c.id == s["id"]), None)
        if conv:
            best_details.append({
                "id": s["id"],
                "source": s["source"],
                "model": conv.model or "unknown",
                "score": s["avg_compound"],
                "turns": len([m for m in conv.messages if m.role == "user"]),
                "preview": _get_preview(conv),
            })

    worst_details = []
    for s in worst:
        conv = next((c for c in conversations if c.id == s["id"]), None)
        if conv:
            worst_details.append({
                "id": s["id"],
                "source": s["source"],
                "model": conv.model or "unknown",
                "score": s["avg_compound"],
                "turns": len([m for m in conv.messages if m.role == "user"]),
                "preview": _get_preview(conv),
            })

    return {"best": best_details, "worst": worst_details}


def _get_preview(conv) -> str:
    for m in conv.messages:
        if m.role == "user" and m.content.strip():
            txt = m.content.strip()
            return txt[:120] + ("..." if len(txt) > 120 else "")
    return "(no user messages)"


def _build_sources_data(conversations: list, sentiment: dict) -> dict:
    data = {}
    for conv in conversations:
        src = conv.source
        if src not in data:
            data[src] = {"sessions": 0, "messages": 0, "tool_calls": 0, "cost": 0.0, "tone_scores": []}
        data[src]["sessions"] += 1
        data[src]["messages"] += conv.message_count
        data[src]["tool_calls"] += conv.tool_call_count
        data[src]["cost"] += conv.estimated_cost_usd

    for s in sentiment.get("per_conversation", []):
        src = s.get("source", "")
        if src in data:
            data[src]["tone_scores"].append(s.get("avg_compound", 0))

    for src in data:
        scores = data[src]["tone_scores"]
        data[src]["avg_tone"] = round(sum(scores) / len(scores), 2) if scores else None
        data[src]["cost"] = round(data[src]["cost"], 4)

    return data


def _serialize_conversations(conversations: list[Conversation]) -> str:
    data = {}
    for conv in conversations:
        msgs = []
        for m in conv.messages:
            ts_str = m.timestamp.strftime("%H:%M:%S") if m.timestamp else ""
            tool_info = ""
            if m.tool_calls:
                names = [tc.get("name", "?") for tc in m.tool_calls]
                tool_info = ", ".join(names)
            msgs.append({
                "role": m.role,
                "content": m.content,
                "ts": ts_str,
                "tool": tool_info,
                "finish_reason": m.finish_reason or "",
            })
        data[conv.id] = {
            "id": conv.id,
            "source": conv.source,
            "model": conv.model or "unknown",
            "started": conv.started_at.strftime("%Y-%m-%d %H:%M") if conv.started_at else "",
            "messages": msgs,
        }
    return json.dumps(data, ensure_ascii=False)
