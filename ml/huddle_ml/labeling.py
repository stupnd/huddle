"""
Turns a raw transcript into training labels, and reports the problems it found.

Nobody labels these by hand. The chat itself says whether Huddle spoke well:

  timing  (one row per human message: should Huddle have spoken here?)
    SPEAK   a human then had to summon Huddle ("@huddle can u reply") for something asked earlier and
            left unanswered, or Huddle spoke here on its own and the group engaged with it.
    SILENT  Huddle spoke here and it was a repeat, got corrected, or was ignored; or the chat simply
            moved on and nobody missed Huddle.
    (a message that itself tags Huddle is `direct`: Huddle must answer, so it teaches nothing about timing)

  drafts  (one row per agent message: did it land?)
    good      the group replied to it with agreement or on its content
    repeat    near-duplicate of something Huddle already said recently
    nag       restated an open decision in prose instead of one numbered list
    corrected a human pushed back ("we want concrete plans", "that's wrong")
    ignored   nobody reacted (weak negative)

Hand edits live in labels/<session_id>.json and always win:
    {"moments": {"<msg id>": {"label": "speak"|"silent", "weight": 1.0}}, "posts": {"<msg id>": "good"|"bad"}}
"""
from __future__ import annotations

import json
import re
import statistics
from dataclasses import dataclass, field
from pathlib import Path

from .session import Message, Session
from .text import contains_phrase, cosine, has_any, overlap, words

LABELS_DIR = Path(__file__).resolve().parent.parent / "labels"

SUMMON = re.compile(r"@\s*(huddle|nova|penny|budget)\b|\bhuddle\b", re.I)
# Triggers that are Huddle's own call to join in. The rest (decision_ready, intro, debate...) are
# dashboard notifications or scripted turns, not a judgment about the conversation.
JUDGED_TRIGGERS = {"chime_in", "conflict", "stuck", "digest", "time_sensitive"}

INFO_REQUEST = ("do you know", "what's good", "what is good", "what are", "give me", "recommend", "what should",
                "what abt", "what about", "what else", "we don't know", "idk", "any ", "is there", "does calgary",
                "how much", "which ")
WH = ("what", "how", "where", "when", "why", "which", "any", "recommend", "suggest", "idk", "dunno")
WEAK_ASK = ("can we", "should we", "can u", "could we")
CORRECTION = ("wrong", "not what", "that's not", "thats not", "we want concrete", "concrete plans", "giving us ranges",
              "too long", "annoying", "stop talking", "please stop", "stop it", "shut up", "not right", "incorrect",
              "doesn't make sense", "no we ", "i said")
REPLY_CUES = ("yes", "yess", "yesss", "ya", "yeah", "ok", "okay", "sure", "thanks", "thank", "love", "perfect",
              "exactly", "nice", "lets", "let's")

# Restating an open decision in prose ("banff day trip is still open, need to pick one"). Feedback on the
# Calgary chat: robotic and overwhelming. The fix is one numbered list, so a post that is that list is fine.
# Only unprompted posts count: a direct answer to "@huddle what's the status" is allowed to talk about it.
NAG_CUES = ("still open", "isn't locked", "isnt locked", "not locked", "isn't settled", "need to pick", "needs to be picked",
            "pick one or", "lock banff", "mark that decided")
DIGEST_HEADER = "still open, most important first"

REPEAT_SIM = 0.6  # an unprompted nudge this similar to an earlier post is a repeat
REPEAT_SIM_ASKED = 0.85  # someone tagged Huddle for it, so a rehash has to be near-identical to count
REPEAT_WINDOW_S = 45 * 60
ENGAGE_WINDOW_S = 150
CORRECT_WINDOW_S = 300
MISS_WINDOW_S = 15 * 60


def is_summon(m: Message) -> bool:
    return not m.is_agent and bool(SUMMON.search(m.text))


def ask_strength(text: str) -> int:
    """2 = a real information request, 1 = a soft question or suggestion, 0 = neither."""
    t = text.lower()
    if contains_phrase(t, INFO_REQUEST) or ("?" in t and has_any(t, WH)):
        return 2
    if "?" in t or contains_phrase(t, WEAK_ASK):
        return 1
    return 0


@dataclass
class Moment:
    session_id: str
    index: int  # position in session.messages
    msg_id: str
    label: str | None  # "speak" | "silent" | None (unknown or direct)
    weight: float
    reason: str
    direct: bool = False


@dataclass
class PostLabel:
    session_id: str
    index: int
    msg_id: str
    label: str  # good | repeat | nag | corrected | ignored
    weight: float
    reason: str


@dataclass
class Report:
    session_id: str
    summons: list[dict] = field(default_factory=list)  # each @huddle: how long the group waited
    missed: list[str] = field(default_factory=list)  # ids of messages that deserved a reply
    repeats: list[str] = field(default_factory=list)
    nags: list[str] = field(default_factory=list)  # open decisions restated in prose
    corrected: list[str] = field(default_factory=list)
    autonomous_posts: int = 0
    engaged: int = 0


def _load_overrides(session_id: str) -> dict:
    p = LABELS_DIR / f"{session_id}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def label_posts(s: Session) -> list[PostLabel]:
    msgs = s.messages
    out: list[PostLabel] = []
    for i, m in enumerate(msgs):
        if not m.is_agent or m.text.strip().lower() == "group created":  # system notice, not Huddle speaking
            continue
        nxt_agent = next((j for j in range(i + 1, len(msgs)) if msgs[j].is_agent), len(msgs))
        after = [h for h in msgs[i + 1 : nxt_agent] if not h.is_agent]
        pushback = next((h for h in after if h.t - m.t <= CORRECT_WINDOW_S and contains_phrase(h.text, CORRECTION)), None)
        if pushback:
            out.append(PostLabel(s.session_id, i, m.id, "corrected", 1.0, f'"{pushback.text[:50]}"'))
            continue
        if m.trigger in JUDGED_TRIGGERS and DIGEST_HEADER not in m.text.lower() and contains_phrase(m.text, NAG_CUES):
            out.append(PostLabel(s.session_id, i, m.id, "nag", 1.0, "open decision restated in prose, not as a numbered list"))
            continue
        earlier = [a for a in msgs[:i] if a.is_agent and m.t - a.t <= REPEAT_WINDOW_S]
        sim = max((cosine(m.text, a.text) for a in earlier), default=0.0)
        if sim >= (REPEAT_SIM if m.trigger else REPEAT_SIM_ASKED):
            out.append(PostLabel(s.session_id, i, m.id, "repeat", 1.0, f"{sim:.2f} similar to an earlier post"))
            continue
        reply = next(
            (
                h
                for h in after[:3]
                if h.t - m.t <= ENGAGE_WINDOW_S
                and (overlap(h.text, m.text) >= 2 or (has_any(h.text, REPLY_CUES) and len(words(h.text)) <= 8))
            ),
            None,
        )
        if reply:
            out.append(PostLabel(s.session_id, i, m.id, "good", 1.0, f'"{reply.text[:50]}"'))
        else:
            out.append(PostLabel(s.session_id, i, m.id, "ignored", 0.4, "no reaction"))

    for pl in out:
        ov = _load_overrides(s.session_id).get("posts", {}).get(pl.msg_id)
        if ov:
            pl.label, pl.weight, pl.reason = ("good" if ov == "good" else "corrected"), 1.0, "hand label"
    return out


def label_moments(s: Session, posts: list[PostLabel] | None = None) -> tuple[list[Moment], Report]:
    msgs = s.messages
    posts = posts if posts is not None else label_posts(s)
    post_by_idx = {p.index: p for p in posts}
    report = Report(s.session_id)
    moments: dict[int, Moment] = {}

    for i, m in enumerate(msgs):
        if m.is_agent:
            continue
        if is_summon(m):
            moments[i] = Moment(s.session_id, i, m.id, None, 0.0, "tags Huddle", direct=True)

    report.repeats = [p.msg_id for p in posts if p.label == "repeat"]
    report.corrected = [p.msg_id for p in posts if p.label == "corrected"]
    report.nags = [p.msg_id for p in posts if p.label == "nag"]

    # 1. Huddle spoke on its own: attribute the post to the last human message before it was queued.
    for i, m in enumerate(msgs):
        if not m.is_agent or m.trigger not in JUDGED_TRIGGERS:
            continue
        report.autonomous_posts += 1
        queued = m.queued_t or m.t
        src = max((j for j in range(i) if not msgs[j].is_agent and msgs[j].t <= queued), default=None)
        pl = post_by_idx.get(i)
        if src is None or pl is None:
            continue
        if pl.label == "good":
            report.engaged += 1
        cur = moments.get(src)
        if cur and cur.direct:
            continue
        if pl.label == "good":
            moments[src] = Moment(s.session_id, src, msgs[src].id, "speak", 1.0, f"Huddle spoke and it landed: {pl.reason}")
        elif pl.label != "ignored" and not (cur and cur.label == "speak"):
            # A post nobody reacted to says little about timing (it may just have arrived too late).
            moments[src] = Moment(s.session_id, src, msgs[src].id, "silent", pl.weight, f"Huddle spoke here but it was {pl.label}")

    # 2. A human had to summon Huddle: what was left unanswered before that was a missed moment.
    for i, m in enumerate(msgs):
        if not is_summon(m):
            continue
        last_agent = max((j for j in range(i) if msgs[j].is_agent), default=-1)
        replied = next((a for a in msgs[i + 1 :] if a.is_agent), None)
        report.summons.append({"id": m.id, "waited_s": round(replied.t - m.t) if replied else None})
        window = [
            j for j in range(last_agent + 1, i)
            if not msgs[j].is_agent and not is_summon(msgs[j]) and m.t - msgs[j].t <= MISS_WINDOW_S
        ]
        for j in window:
            strength = ask_strength(msgs[j].text)
            if strength == 0 or (j in moments and moments[j].label is not None):
                continue
            moments[j] = Moment(
                s.session_id, j, msgs[j].id, "speak", 1.0 if strength == 2 else 0.3,
                f"asked, no reply, then someone tagged Huddle {round(m.t - msgs[j].t)}s later",
            )
            if strength == 2:
                report.missed.append(msgs[j].id)

    # 3. Everything else: the chat moved on and nobody missed Huddle.
    for i, m in enumerate(msgs):
        if m.is_agent or i in moments:
            continue
        if ask_strength(m.text) == 2:
            moments[i] = Moment(s.session_id, i, m.id, None, 0.0, "unanswered ask, outcome unknown")
        else:
            moments[i] = Moment(s.session_id, i, m.id, "silent", 0.5, "nobody missed Huddle")

    ov = _load_overrides(s.session_id).get("moments", {})
    for mo in moments.values():
        if mo.msg_id in ov:
            mo.label, mo.weight, mo.reason = ov[mo.msg_id]["label"], float(ov[mo.msg_id].get("weight", 1.0)), "hand label"
    return [moments[k] for k in sorted(moments)], report


def response_latencies(report: Report) -> dict:
    waits = [x["waited_s"] for x in report.summons if x["waited_s"] is not None]
    return {
        "summons": len(report.summons),
        "median_wait_s": round(statistics.median(waits)) if waits else None,
        "max_wait_s": max(waits) if waits else None,
    }
