from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime

from . import labeling, models, taste
from .labeling import LABELS_DIR
from .session import SESSIONS_DIR, Message, Session, ingest, load_all, save, scrub_names


def _sessions(name: str | None = None) -> list[Session]:
    ss = load_all()
    if name:
        ss = [s for s in ss if s.session_id == name]
        if not ss:
            raise SystemExit(f"No session '{name}' in {SESSIONS_DIR}")
    if not ss:
        raise SystemExit(f"No sessions yet. Add one with: python -m huddle_ml ingest <trip URL | file>")
    return ss


def _clock(t: float) -> str:
    return datetime.fromtimestamp(t).strftime("%H:%M:%S")


def cmd_ingest(a):
    s = ingest(a.source, a.name)
    if a.scrub:
        scrub_names(s, a.scrub.split(","))
    path = save(s)
    humans = sum(1 for m in s.messages if not m.is_agent)
    print(f"saved {path.name}: {len(s.messages)} messages ({humans} human), mention mode {s.mention_mode or 'unknown'}")


def cmd_sessions(_):
    for s in _sessions():
        moments, rep = labeling.label_moments(s)
        c = Counter(m.label for m in moments)
        print(f"{s.session_id:24} {len(s.messages):4} msgs  speak={c['speak']} silent={c['silent']} unknown={c[None]}")


def cmd_diagnose(a):
    for s in _sessions(a.session):
        moments, rep = labeling.label_moments(s)
        posts = labeling.label_posts(s)
        c = Counter(p.label for p in posts)
        lat = labeling.response_latencies(rep)
        print(f"== {s.session_id}")
        print(f"  Huddle posts: {len(posts)}   good {c['good']}, repeats {c['repeat']}, open-decision nags {c['nag']}, pushed back on {c['corrected']}, ignored {c['ignored']}")
        print(f"  unprompted posts (chime-in/conflict): {rep.autonomous_posts}, engaged with: {rep.engaged}")
        print(f"  tagged {lat['summons']}x; once tagged Huddle replied in {lat['median_wait_s']}s (median), {lat['max_wait_s']}s (max)")
        print(f"  questions left unanswered until someone had to tag Huddle: {len(rep.missed)}")
        msgs = {m.id: m for m in s.messages}
        for mid in rep.missed:
            print(f"    missed  {_clock(msgs[mid].t)}  {msgs[mid].text[:70]}")
        for p in posts:
            if p.label in ("repeat", "corrected", "nag"):
                print(f"    {p.label:9} {_clock(s.messages[p.index].t)}  {s.messages[p.index].text[:60]!r}  ({p.reason[:40]})")


def cmd_label(a):
    s = _sessions(a.session)[0]
    path = LABELS_DIR / f"{s.session_id}.json"
    ov = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    changed = False
    for item in a.set or []:
        mid, _, val = item.partition("=")
        if val not in ("speak", "silent"):
            raise SystemExit("--set expects <msg id>=speak|silent")
        ov.setdefault("moments", {})[mid] = {"label": val, "weight": 1.0}
        changed = True
    for item in a.post or []:
        mid, _, val = item.partition("=")
        if val not in ("good", "bad"):
            raise SystemExit("--post expects <msg id>=good|bad")
        ov.setdefault("posts", {})[mid] = val
        changed = True
    if changed:
        LABELS_DIR.mkdir(exist_ok=True)
        path.write_text(json.dumps(ov, indent=1), encoding="utf-8")
        print(f"saved {path}")
        return
    moments, _ = labeling.label_moments(s)
    posts = {p.index: p for p in labeling.label_posts(s)}
    by_idx = {m.index: m for m in moments}
    print("id        time      label   wt   message  [reason]     (fix with --set <id>=speak|silent or --post <id>=good|bad)")
    for i, m in enumerate(s.messages):
        if m.is_agent:
            p = posts.get(i)
            print(f"{m.id}  {_clock(m.t)}  HUDDLE  {'':4} {m.text[:60]!r}  [{p.label if p else '-'}]")
        else:
            mo = by_idx.get(i)
            print(f"{m.id}  {_clock(m.t)}  {(mo.label or '-'):6}  {mo.weight:.1f}  {m.text[:60]!r}  [{mo.reason[:50]}]")


def cmd_train(a):
    sessions = _sessions()
    print(f"training on {len(sessions)} session(s): {', '.join(s.session_id for s in sessions)}")
    for name, ds, feats, rule in (
        ("timing", models.timing_dataset(sessions), models.TIMING_NAMES, models.ask_rule),
        ("draft", models.draft_dataset(sessions), models.DRAFT_NAMES, None),
    ):
        meta = models.train(name, ds, feats, rule)
        cv = meta["cv"]
        print(f"\n[{name}] {meta['n']} examples, {meta['positives']} positive (base rate {cv['base_rate']})")
        print(f"  out-of-fold ({cv['scheme']}): precision {cv['precision']}, recall {cv['recall']}, F1 {cv['f1']}  @ threshold {meta['threshold']}")
        if meta["baseline_rule"]:
            b = meta["baseline_rule"]
            print(f"  plain rule 'speak on any real question': precision {b['precision']}, recall {b['recall']}, F1 {b['f1']}  <- the bar to beat")
        print("  strongest signals: " + ", ".join(f"{x['feature']} {x['weight']:+.2f}" for x in meta["top_signals"]))
    profile = taste.build(sessions)
    print(f"\n[taste] wrote {taste.save(profile).name}")
    if len(sessions) < 5:
        print("\nnote: this is a small sample. Treat the numbers as a smoke test; expect real signal after ~20 sessions.")


def cmd_score(a):
    s = _sessions(a.session)[0]
    bundle = models.load("timing")
    moments, _ = labeling.label_moments(s)
    print(f"{s.session_id}: model vs what happened (model was trained on this session, so this flatters it)")
    print("time      p     model   auto-label  message")
    for mo in moments:
        if mo.direct:
            continue
        pred = models.predict_timing(s.messages[: mo.index + 1])
        print(f"{_clock(s.messages[mo.index].t)}  {pred['p']:.2f}  {'SPEAK' if pred['speak'] else '-':6}  {(mo.label or '?'):9}   {s.messages[mo.index].text[:55]!r}  ({pred['why']})")
    print(f"threshold {bundle['meta']['threshold']}")


def cmd_predict(_):
    """Reads {"messages": [{"sender": "P1"|"agent", "text": "...", "t": <epoch s>}], "draft": "optional"} on stdin."""
    payload = json.load(sys.stdin)
    msgs = [Message(id=str(i), t=float(m["t"]), sender=m["sender"], text=m["text"], trigger=m.get("trigger"))
            for i, m in enumerate(payload["messages"])]
    out = {"timing": models.predict_timing(msgs)}
    if payload.get("draft"):
        t = msgs[-1].t + 60 if msgs else 0.0
        out["draft"] = models.predict_draft(msgs, Message("draft", t, "agent", payload["draft"], trigger=payload.get("trigger", "chime_in")))
    print(json.dumps(out, indent=1))


def cmd_profile(a):
    prof = taste.load()
    print(f"built from: {', '.join(prof['sessions'])}")
    g = prof["group"]
    print(f"\ngroup topics (score -1..+1, mentions): " + ", ".join(f"{t} {v['score']:+.2f} ({v['mentions']})" for t, v in sorted(g["topics"].items(), key=lambda kv: -kv[1]["score"])))
    print(f"style asks: {g['style'] or 'none yet'}   tag rate: {g['tag_rate']:.0%} of messages tag Huddle")
    for k, v in prof["people"].items():
        if a.session and v["session"] != a.session:
            continue
        spend = "unknown" if v["spend"] is None else ("luxury" if v["spend"] > 0.2 else "frugal" if v["spend"] < -0.2 else "mixed") + f" ({v['spend']:+.2f})"
        top = ", ".join(f"{t} {x['score']:+.2f}" for t, x in sorted(v["topics"].items(), key=lambda kv: -kv[1]["score"])[:4])
        print(f"\n{k}: spend {spend}\n  likes: {top or 'nothing yet'}")


def cmd_rank(a):
    for opt, score in taste.rank(taste.load(), a.options, a.session):
        print(f"{score:+.2f}  {opt}")


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(prog="huddle_ml", description="Learn when Huddle should speak and what groups like, from chat sessions.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("ingest", help="add a session (trip URL, API JSON, normalized JSON, or 'Name: text' file)")
    p.add_argument("source"); p.add_argument("--name"); p.add_argument("--scrub", help="comma-separated extra names to blank out")
    p.set_defaults(fn=cmd_ingest)
    sub.add_parser("sessions", help="list sessions and label counts").set_defaults(fn=cmd_sessions)
    p = sub.add_parser("diagnose", help="what went wrong in the chat(s)"); p.add_argument("session", nargs="?"); p.set_defaults(fn=cmd_diagnose)
    p = sub.add_parser("label", help="review auto-labels, or fix them by hand")
    p.add_argument("session"); p.add_argument("--set", action="append", metavar="ID=speak|silent"); p.add_argument("--post", action="append", metavar="ID=good|bad")
    p.set_defaults(fn=cmd_label)
    sub.add_parser("train", help="train timing + draft models and rebuild the taste profile").set_defaults(fn=cmd_train)
    p = sub.add_parser("score", help="replay a session through the timing model"); p.add_argument("session"); p.set_defaults(fn=cmd_score)
    sub.add_parser("predict", help="JSON on stdin -> should Huddle speak / would this draft land").set_defaults(fn=cmd_predict)
    p = sub.add_parser("profile", help="show what the group likes"); p.add_argument("session", nargs="?"); p.set_defaults(fn=cmd_profile)
    p = sub.add_parser("rank", help="order suggestions by taste"); p.add_argument("options", nargs="+"); p.add_argument("--session"); p.set_defaults(fn=cmd_rank)

    a = ap.parse_args(argv)
    a.fn(a)
