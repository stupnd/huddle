"""
Feature extraction. Everything is computed from the messages *before and including* the one being
judged, so a trained model can score a live chat the same way it was trained.
"""
from __future__ import annotations

import re

import numpy as np

from .labeling import ask_strength, is_summon
from .session import Message
from .text import contains_phrase, cosine, has_any, words

MONEY = ("$", "budget", "expensive", "cheap", "cost", "price", "afford", "spend", "pay", "flights", "splurge")
DATES = ("dec", "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "monday", "tuesday",
         "wednesday", "thursday", "friday", "saturday", "sunday", "weekend", "days", "week", "night", "nights")
DECIDING = ("lets", "let's", "should", "want", "wanna", "book", "pick", "choose", "decide", "go with", "stay at")
UNCERTAIN = ("idk", "dunno", "unsure", "not sure", "maybe", "hmm", "no idea", "don't know", "dont know")
BANTER = ("lol", "lmao", "haha", "hahaha", "stupid", "😭", "😂", "🤣", "omg", "mb")
HEDGES = ("usually", "roughly", "around", "maybe", "range", "options", "or", "depending", "about", "could")
FRUSTRATION = re.compile(r"(o{3,}|\bpls\b|\bplease\b|!{2,}|hello+)", re.I)

TIMING_FEATURES = [
    "ask", "qmark", "uncertain", "banter", "agreement", "frustrated", "money", "dates", "deciding", "n_words",
    "gap_prev_s", "since_agent_s", "humans_since_agent", "rate_5min", "speakers_recent", "open_asks", "same_speaker_run",
    "agent_posts_15min", "covered_by_agent", "chat_is_active",
]
DRAFT_FEATURES = [
    "n_words", "n_lines", "has_price", "has_time", "n_numbers", "hedges", "questions", "ends_question", "repeat_sim",
    "relevance", "urgency", "is_direct", "trig_chime_in", "trig_conflict", "trig_decision_ready", "trig_intro",
]


def _cap(x: float, hi: float) -> float:
    return float(min(x, hi))


def timing_features(msgs: list[Message], i: int) -> list[float]:
    """Features for 'should Huddle speak right after message i?' (i is a human message)."""
    m = msgs[i]
    text = m.text
    prev = msgs[i - 1] if i else None
    last_agent = max((j for j in range(i) if msgs[j].is_agent), default=None)
    since_agent = m.t - msgs[last_agent].t if last_agent is not None else 3600.0
    since_idx = (last_agent + 1) if last_agent is not None else 0
    humans_since = [x for x in msgs[since_idx : i + 1] if not x.is_agent]
    recent = [x for x in msgs[:i + 1] if not x.is_agent and m.t - x.t <= 300]
    agent_15 = sum(1 for x in msgs[:i] if x.is_agent and m.t - x.t <= 900)

    run = 0
    for x in reversed(msgs[:i]):
        if x.sender == m.sender:
            run += 1
        else:
            break

    open_asks = sum(1 for x in humans_since if ask_strength(x.text) == 2 and not is_summon(x))
    covered = max((cosine(text, msgs[j].text) for j in range(i) if msgs[j].is_agent and m.t - msgs[j].t <= 1800), default=0.0)
    rate = len(recent) / 5.0
    return [
        float(ask_strength(text)),
        float("?" in text),
        float(has_any(text, UNCERTAIN) or contains_phrase(text, UNCERTAIN)),
        float(contains_phrase(text, BANTER)),
        float(len(words(text)) <= 4 and has_any(text, ("yes", "ya", "yeah", "ok", "nice", "yesss", "yess", "lets"))),
        float(bool(FRUSTRATION.search(text))),
        float(contains_phrase(text, MONEY)),
        float(has_any(text, DATES) or bool(re.search(r"\b\d{1,2}(st|nd|rd|th)?\b", text))),
        float(contains_phrase(text, DECIDING)),
        _cap(len(words(text)), 40),
        _cap(m.t - prev.t, 3600) if prev else 3600.0,
        _cap(since_agent, 3600),
        _cap(len(humans_since), 30),
        _cap(rate, 10),
        float(len({x.sender for x in recent})),
        _cap(open_asks, 6),
        _cap(run, 6),
        _cap(agent_15, 6),
        covered,
        float(rate >= 1.0),
    ]


def draft_features(msgs: list[Message], i: int) -> list[float]:
    """Features for 'will this agent message land well?' (i is an agent message)."""
    m = msgs[i]
    text = m.text
    earlier = [a for a in msgs[:i] if a.is_agent and m.t - a.t <= 45 * 60]
    humans = [h for h in msgs[:i] if not h.is_agent][-3:]
    lines = [ln for ln in text.splitlines() if ln.strip()]
    trig = m.trigger
    return [
        _cap(len(words(text)), 120),
        float(len(lines)),
        float(bool(re.search(r"\$\s?\d|\d\s?\$|\bpp\b", text))),
        float(bool(re.search(r"\b\d{1,2}(:\d{2})?\s?(am|pm)\b", text, re.I))),
        _cap(len(re.findall(r"\d+", text)), 20),
        float(sum(text.lower().count(h) for h in HEDGES)),
        float(text.count("?")),
        float(text.rstrip().endswith("?")),
        max((cosine(text, a.text) for a in earlier), default=0.0),
        max((cosine(text, h.text) for h in humans), default=0.0),
        float(m.urgency or 0),
        float(trig is None),
        float(trig == "chime_in"),
        float(trig == "conflict"),
        float(trig == "decision_ready"),
        float(trig == "intro"),
    ]


def matrix(rows: list[list[float]]) -> np.ndarray:
    return np.asarray(rows, dtype=float)


def describe_timing(row: list[float]) -> str:
    """Human-readable summary of why a moment looks the way it does, for `score` output."""
    d = dict(zip(TIMING_FEATURES, row))
    bits = []
    if d["ask"] == 2:
        bits.append("information request")
    elif d["ask"] == 1:
        bits.append("soft question")
    if d["open_asks"] >= 1:
        bits.append(f"{int(d['open_asks'])} unanswered ask(s)")
    if d["since_agent_s"] >= 600:
        bits.append(f"Huddle silent {int(d['since_agent_s'] // 60)} min")
    if d["banter"]:
        bits.append("banter")
    if d["covered_by_agent"] > 0.5:
        bits.append("already covered by Huddle")
    return ", ".join(bits) or "routine chatter"
