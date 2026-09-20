"""Small text helpers shared by labeling, features and the taste profile. No dependencies."""
from __future__ import annotations

import math
import re
from collections import Counter

STOP = set(
    "a an the and or but if so to of in on at for with from by is are was were be been am i me my we us our you your "
    "it its this that these those there here what which who how do does did can could should would will just not no "
    "yes ok okay oh ya yeah lol im ill ive dont wanna gonna let lets get got have has had also too very really".split()
)

_WORD = re.compile(r"[a-z0-9$']+")


def words(text: str) -> list[str]:
    return _WORD.findall(text.lower())


def content_words(text: str) -> list[str]:
    return [w for w in words(text) if w not in STOP and len(w) > 2]


def cosine(a: str, b: str) -> float:
    """Bag-of-content-words cosine similarity, 0..1. Enough to spot a repeated nudge."""
    ca, cb = Counter(content_words(a)), Counter(content_words(b))
    if not ca or not cb:
        return 0.0
    dot = sum(ca[w] * cb[w] for w in ca.keys() & cb.keys())
    return dot / (math.sqrt(sum(v * v for v in ca.values())) * math.sqrt(sum(v * v for v in cb.values())))


def overlap(a: str, b: str) -> int:
    """How many distinct content words the two texts share."""
    return len(set(content_words(a)) & set(content_words(b)))


def has_any(text: str, cues: tuple[str, ...]) -> bool:
    t = " " + " ".join(words(text)) + " "
    return any(f" {c} " in t for c in cues)


def contains_phrase(text: str, phrases: tuple[str, ...]) -> bool:
    t = text.lower()
    return any(p in t for p in phrases)
