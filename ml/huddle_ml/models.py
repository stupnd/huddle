"""
The two learned models.

  timing  P(Huddle should speak right after this human message)         -> replaces the lull/chime-in guess
  draft   P(this agent message lands well: engaged with, not a repeat)  -> gates a drafted message

Both are class-balanced logistic regressions on a handful of interpretable features. That is deliberate:
with tens of moments per session they are easy to inspect, train in milliseconds, and cannot memorize a
chat the way a big model would. The decision threshold is chosen on out-of-fold predictions and favors
precision (F0.5), because silence is Huddle's default and a wrong interruption costs more than a missed one.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import precision_recall_fscore_support
from sklearn.model_selection import KFold, LeaveOneGroupOut
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from .features import DRAFT_FEATURES, TIMING_FEATURES, describe_timing, draft_features, matrix, timing_features
from .labeling import label_moments, label_posts
from .session import Message, Session

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
MIN_PER_CLASS = 5


@dataclass
class Dataset:
    X: np.ndarray
    y: np.ndarray
    w: np.ndarray
    groups: np.ndarray
    ids: list[str]


def timing_dataset(sessions: list[Session]) -> Dataset:
    rows, y, w, g, ids = [], [], [], [], []
    for s in sessions:
        moments, _ = label_moments(s)
        for mo in moments:
            if mo.label is None or mo.direct:
                continue
            rows.append(timing_features(s.messages, mo.index))
            y.append(int(mo.label == "speak"))
            w.append(mo.weight)
            g.append(s.session_id)
            ids.append(mo.msg_id)
    return Dataset(matrix(rows), np.array(y), np.array(w), np.array(g), ids)


def draft_dataset(sessions: list[Session]) -> Dataset:
    rows, y, w, g, ids = [], [], [], [], []
    for s in sessions:
        for p in label_posts(s):
            rows.append(draft_features(s.messages, p.index))
            y.append(int(p.label == "good"))
            w.append(p.weight)
            g.append(s.session_id)
            ids.append(p.msg_id)
    return Dataset(matrix(rows), np.array(y), np.array(w), np.array(g), ids)


def _pipe():
    return make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced", C=0.5, max_iter=2000))


def _fit(X, y, w):
    p = _pipe()
    p.fit(X, y, logisticregression__sample_weight=w)
    return p


def _out_of_fold(d: Dataset) -> tuple[np.ndarray, str]:
    """Leave-one-session-out when there are several sessions, else four contiguous blocks of one."""
    if len(set(d.groups)) >= 2:
        splits, how = LeaveOneGroupOut().split(d.X, d.y, d.groups), "leave-one-session-out"
    else:
        splits, how = KFold(n_splits=4, shuffle=False).split(d.X), "4 contiguous blocks (single session)"
    p = np.full(len(d.y), d.y.mean())
    for tr, te in splits:
        if len(set(d.y[tr])) < 2:
            continue
        p[te] = _fit(d.X[tr], d.y[tr], d.w[tr]).predict_proba(d.X[te])[:, 1]
    return p, how


def _pick_threshold(y: np.ndarray, p: np.ndarray, w: np.ndarray) -> float:
    best, best_f = 0.5, -1.0
    for t in np.arange(0.2, 0.91, 0.05):
        pred = (p >= t).astype(int)
        pr, rc, _, _ = precision_recall_fscore_support(y, pred, sample_weight=w, average="binary", zero_division=0)
        f = (1.25 * pr * rc / (0.25 * pr + rc)) if (0.25 * pr + rc) else 0.0
        if f >= best_f:
            best, best_f = float(t), f
    return round(best, 2)


def train(name: str, d: Dataset, feature_names: list[str], baseline=None) -> dict:
    pos, neg = int(d.y.sum()), int((1 - d.y).sum())
    if pos < MIN_PER_CLASS or neg < MIN_PER_CLASS:
        raise SystemExit(
            f"{name}: need at least {MIN_PER_CLASS} examples of each class, have {pos} positive / {neg} negative. "
            "Ingest more sessions (or add hand labels in labels/) and try again."
        )
    oof, how = _out_of_fold(d)
    thr = _pick_threshold(d.y, oof, d.w)
    pred = (oof >= thr).astype(int)
    pr, rc, f1, _ = precision_recall_fscore_support(d.y, pred, sample_weight=d.w, average="binary", zero_division=0)
    base = None
    if baseline is not None:  # the labels lean on the same cue the rule uses, so the model has to beat it to matter
        bp, br, bf, _ = precision_recall_fscore_support(d.y, baseline(d.X).astype(int), sample_weight=d.w, average="binary", zero_division=0)
        base = {"precision": round(float(bp), 3), "recall": round(float(br), 3), "f1": round(float(bf), 3)}
    model = _fit(d.X, d.y, d.w)
    coefs = model[-1].coef_[0]
    meta = {
        "name": name,
        "features": feature_names,
        "threshold": thr,
        "n": len(d.y),
        "positives": pos,
        "sessions": sorted(set(d.groups.tolist())),
        "cv": {"scheme": how, "precision": round(float(pr), 3), "recall": round(float(rc), 3), "f1": round(float(f1), 3),
               "base_rate": round(float(np.average(d.y, weights=d.w)), 3)},
        "baseline_rule": base,
        "top_signals": sorted(
            ({"feature": f, "weight": round(float(c), 3)} for f, c in zip(feature_names, coefs)),
            key=lambda x: -abs(x["weight"]),
        )[:6],
    }
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "meta": meta}, MODELS_DIR / f"{name}.joblib")
    (MODELS_DIR / f"{name}.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    return meta


def load(name: str) -> dict:
    p = MODELS_DIR / f"{name}.joblib"
    if not p.exists():
        raise SystemExit(f"No trained {name} model. Run: python -m huddle_ml train")
    return joblib.load(p)


def predict_timing(msgs: list[Message]) -> dict:
    """Should Huddle speak now? `msgs` is the chat so far; the last human message is the moment."""
    bundle = load("timing")
    i = max((k for k, m in enumerate(msgs) if not m.is_agent), default=None)
    if i is None:
        return {"speak": False, "p": 0.0, "threshold": bundle["meta"]["threshold"], "why": "no human message yet"}
    row = timing_features(msgs, i)
    p = float(bundle["model"].predict_proba(matrix([row]))[0, 1])
    return {"speak": p >= bundle["meta"]["threshold"], "p": round(p, 3), "threshold": bundle["meta"]["threshold"],
            "why": describe_timing(row)}


def predict_draft(msgs: list[Message], draft: Message) -> dict:
    """Would this drafted message land well? `draft` is appended to the chat and scored."""
    bundle = load("draft")
    chat = [*msgs, draft]
    p = float(bundle["model"].predict_proba(matrix([draft_features(chat, len(chat) - 1)]))[0, 1])
    return {"send": p >= bundle["meta"]["threshold"], "p": round(p, 3), "threshold": bundle["meta"]["threshold"]}


TIMING_NAMES, DRAFT_NAMES = TIMING_FEATURES, DRAFT_FEATURES


def ask_rule(X: np.ndarray) -> np.ndarray:
    """The naive policy 'speak whenever someone asks a real question'. The model must beat this."""
    return X[:, TIMING_FEATURES.index("ask")] >= 2
