"""
What the group likes.

A transparent profile rather than a black box: for each person and for the group it keeps
  - topic affinity   how positively they talk about skiing, food, nightlife, ... (-1 dislike .. +1 love)
  - spend mood       frugal .. luxury, recency-weighted so "I don't wanna spend too much" followed by
                     "make us an expensive trip" ends up on the luxury side
  - style asks       explicit feedback about how Huddle should talk ("we want concrete plans")
  - responsiveness   how often the group had to tag Huddle to get an answer
Profiles are rebuilt from every session on `train`, so adding sessions sharpens them. `rank` scores a list
of candidate suggestions so Huddle can lead with what this group is likely to want.
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from pathlib import Path

from .labeling import is_summon
from .session import Session
from .text import contains_phrase, has_any, words

PROFILE_PATH = Path(__file__).resolve().parent.parent / "models" / "taste.json"

TOPICS: dict[str, tuple[str, ...]] = {
    "snow_sports": ("ski", "skiing", "snowboard", "snowboarding", "tubing", "tube", "sledding", "snowshoe", "icewalk", "ice"),
    "hiking_nature": ("hike", "hiking", "trail", "lake", "canyon", "mountain", "park", "waterfall", "wildlife", "nature", "scenic"),
    "food": ("food", "restaurant", "dinner", "lunch", "brunch", "breakfast", "cafe", "coffee", "eat", "eating", "bbq", "tea"),
    "nightlife": ("bar", "bars", "club", "clubs", "nightlife", "drinks", "party", "concert", "fireworks", "nye"),
    "culture": ("museum", "gallery", "history", "historic", "heritage", "art", "theatre", "show", "market"),
    "sports_events": ("hockey", "game", "juniors", "stampede", "match", "stadium"),
    "family_lights": ("zoo", "lights", "glow", "kids", "skating", "holiday", "christmas"),
    "luxury_stay": ("fairmont", "resort", "spa", "hotel", "suite", "helicopter", "luxury", "splurge", "gondola"),
    "shopping": ("shopping", "mall", "shop", "outlet", "souvenir"),
    "relaxing": ("relax", "chill", "rest", "spa", "hot springs", "slow"),
}
POSITIVE = ("want", "wanna", "love", "lets", "let's", "yes", "ya", "yeah", "yess", "yesss", "interested", "excited",
            "should", "down", "sounds good", "perfect", "nice")
NEGATIVE = ("dont", "don't", "not", "no", "hate", "skip", "boring", "never", "avoid", "nah", "rather not")
FRUGAL = ("don't wanna spend", "dont wanna spend", "too expensive", "expensive", "cheap", "budget", "afford", "save",
          "cost", "money", "pricey")
LUXURY = ("splurge", "most expensive", "luxury", "fairmont", "fancy", "treat", "spend it", "money is no object",
          "helicopter", "upgrade", "lottery", "pay for everything")
STYLE_ASKS = {
    "concrete": ("concrete", "specific", "exact", "proper day by day", "day by day", "no ranges"),
    "brief": ("too long", "shorter", "too much text", "tldr", "keep it short"),
    "quiet": ("stop talking", "too many messages", "quiet", "shut up", "spam", "please stop"),
    "faster": ("can u reply", "can you reply", "hello", "??", "anyone there", "still there"),
}
HALF_LIFE_MSGS = 10.0


def _topics_in(text: str) -> list[str]:
    ws = set(words(text))
    low = text.lower()
    return [t for t, kws in TOPICS.items() if any((k in ws) if " " not in k else (k in low) for k in kws)]


def _polarity(text: str, topic_kw_positions: list[int], ws: list[str]) -> float:
    """+1 wants it, -1 rejects it, +0.3 merely mentions it."""
    for pos in topic_kw_positions:
        if any(w in NEGATIVE for w in ws[max(0, pos - 4) : pos]):
            return -1.0
    if has_any(text, POSITIVE) or contains_phrase(text, ("sounds good", "let's", "wanna", "i want")):
        return 1.0
    return 0.3


def build(sessions: list[Session]) -> dict:
    people: dict[str, dict] = {}
    group_style = defaultdict(int)
    group_topics: dict[str, list[float]] = defaultdict(list)
    tags = 0
    humans = 0

    for s in sessions:
        seq: dict[str, int] = defaultdict(int)
        for m in s.messages:
            if m.is_agent:
                continue
            key = f"{s.session_id}:{m.sender}"
            p = people.setdefault(key, {"topics": defaultdict(list), "spend": [], "session": s.session_id, "who": m.sender})
            seq[key] += 1
            humans += 1
            tags += is_summon(m)
            ws = words(m.text)
            for t in _topics_in(m.text):
                kws = TOPICS[t]
                pos = [i for i, w in enumerate(ws) if w in kws]
                pol = _polarity(m.text, pos, ws)
                p["topics"][t].append(pol)
                group_topics[t].append(pol)
            # "make the most expensive trip" hits both lists; the luxury reading wins
            score = 1.0 if contains_phrase(m.text, LUXURY) else -1.0 if contains_phrase(m.text, FRUGAL) else 0.0
            if score:
                p["spend"].append((seq[key], score))
            for style, cues in STYLE_ASKS.items():
                if contains_phrase(m.text, cues):
                    group_style[style] += 1

    def smooth(vals: list[float]) -> float:
        return sum(vals) / (len(vals) + 2)  # shrink toward 0 when there is little evidence

    def spend(pts: list[tuple[int, float]]) -> float | None:
        if not pts:
            return None
        last = max(i for i, _ in pts)
        num = sum(v * 0.5 ** ((last - i) / HALF_LIFE_MSGS) for i, v in pts)
        den = sum(0.5 ** ((last - i) / HALF_LIFE_MSGS) for i, _ in pts)
        return round(num / den, 2)

    return {
        "sessions": [s.session_id for s in sessions],
        "group": {
            "topics": {t: {"score": round(smooth(v), 2), "mentions": len(v)} for t, v in sorted(group_topics.items())},
            "style": dict(group_style),
            "tag_rate": round(tags / humans, 3) if humans else 0.0,
        },
        "people": {
            k: {
                "session": v["session"],
                "topics": {t: {"score": round(smooth(x), 2), "mentions": len(x)} for t, x in sorted(v["topics"].items())},
                "spend": spend(v["spend"]),
            }
            for k, v in people.items()
        },
    }


def save(profile: dict) -> Path:
    PROFILE_PATH.parent.mkdir(parents=True, exist_ok=True)
    PROFILE_PATH.write_text(json.dumps(profile, indent=1), encoding="utf-8")
    return PROFILE_PATH


def load() -> dict:
    if not PROFILE_PATH.exists():
        raise SystemExit("No taste profile yet. Run: python -m huddle_ml train")
    return json.loads(PROFILE_PATH.read_text(encoding="utf-8"))


def rank(profile: dict, options: list[str], session_id: str | None = None) -> list[tuple[str, float]]:
    """Order candidate suggestions by how well they match what this group has said it likes."""
    topics = dict(profile["group"]["topics"])
    if session_id:
        merged: dict[str, list[float]] = defaultdict(list)
        for v in profile["people"].values():
            if v["session"] == session_id:
                for t, x in v["topics"].items():
                    merged[t].append(x["score"])
        topics.update({t: {"score": sum(v) / len(v), "mentions": 1} for t, v in merged.items()})
    scored = []
    for opt in options:
        hits = [topics[t]["score"] * (1 + math.log1p(topics[t]["mentions"])) for t in _topics_in(opt) if t in topics]
        scored.append((opt, round(sum(hits), 3)))
    return sorted(scored, key=lambda x: -x[1])
