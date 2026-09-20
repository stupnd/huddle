"""
Sessions: one group-chat transcript in a normalized, anonymized shape.

    {
      "session_id": "calgary-04c2",
      "mention_mode": "listen_in" | "tag_only" | null,
      "messages": [{"id", "t" (epoch seconds), "sender" ("P1".."Pn" | "agent"), "persona", "text",
                    "trigger" (agents only: chime_in | conflict | ... | null for direct replies), "urgency", "queued_t"}],
      "preferences": [{"who", "category", "value"}]        # optional, from the app's own extraction
    }

`ingest` accepts a trip page URL, a /api/trip/<id> URL, a saved API JSON file, an already-normalized
session, or a plain-text transcript ("Name: message" per line). Names and phone numbers are replaced
with P1, P2, ... so sessions can be shared and trained on without identifying anyone.
"""
from __future__ import annotations

import json
import re
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

SESSIONS_DIR = Path(__file__).resolve().parent.parent / "sessions"
AGENT_NAMES = {"huddle", "nova", "penny", "budget"}


@dataclass
class Message:
    id: str
    t: float
    sender: str
    text: str
    persona: str | None = None
    trigger: str | None = None
    urgency: int | None = None
    queued_t: float | None = None  # agents only: when the app queued the message (it posts later, after the lull)

    @property
    def is_agent(self) -> bool:
        return self.sender == "agent"


@dataclass
class Session:
    session_id: str
    messages: list[Message]
    mention_mode: str | None = None
    preferences: list[dict] = field(default_factory=list)

    def to_json(self) -> dict:
        return {
            "session_id": self.session_id,
            "mention_mode": self.mention_mode,
            "messages": [m.__dict__ for m in self.messages],
            "preferences": self.preferences,
        }

    @staticmethod
    def from_json(d: dict) -> "Session":
        return Session(
            d["session_id"],
            [Message(**m) for m in d["messages"]],
            d.get("mention_mode"),
            d.get("preferences", []),
        )


def _ts(iso: str) -> float:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def _scrub(text: str, aliases: dict[str, str]) -> str:
    for raw, token in sorted(aliases.items(), key=lambda kv: -len(kv[0])):
        if raw:
            text = re.sub(re.escape(raw), token, text, flags=re.IGNORECASE)
    return re.sub(r"\+?\d[\d\s().-]{8,}\d", "<phone>", text)


def from_api(data: dict, session_id: str | None = None) -> Session:
    """Normalize the JSON that GET /api/trip/<id> returns."""
    trip = data["trip"]
    people = {p["id"]: f"P{i + 1}" for i, p in enumerate(data.get("participants", []))}
    aliases: dict[str, str] = {}
    for i, p in enumerate(data.get("participants", [])):
        token = f"P{i + 1}"
        for raw in (p.get("display_name"), p.get("address")):
            if raw:
                aliases[raw] = token
        if p.get("address"):
            aliases[p["address"].lstrip("+")] = token

    # Agent messages that have a speak_candidate were posted on the agent's own initiative.
    # Direct replies (someone tagged Huddle) skip the candidate queue, so they have none.
    by_content = {c["content"]: c for c in data.get("candidates", [])}
    msgs: list[Message] = []
    for m in data["messages"]:
        if m["sender_type"] == "human":
            sender, persona, cand = people.get(m["participant_id"], "P?"), None, None
        else:
            sender, persona = "agent", m.get("persona") or "huddle"
            cand = by_content.get(m["content"])
        msgs.append(
            Message(
                id=m["id"][:8],
                t=_ts(m["created_at"]),
                sender=sender,
                text=_scrub(m["content"], aliases),
                persona=persona,
                trigger=cand["trigger"] if cand else None,
                urgency=cand["urgency"] if cand else None,
                queued_t=_ts(cand["created_at"]) if cand else None,
            )
        )
    msgs.sort(key=lambda x: x.t)
    prefs = [
        {"who": people.get(p["participant_id"], "P?"), "category": p["category"], "value": _scrub(p["value"], aliases)}
        for p in data.get("preferences", [])
        if p.get("visibility") != "private" and p.get("value")
    ]
    sid = session_id or f"trip-{trip['id'][:8]}"
    return Session(sid, msgs, (trip.get("settings") or {}).get("mention_mode"), prefs)


_LINE = re.compile(r"^\s*(?:(\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}(?::\d{2})?)\s+)?([^:]{1,30}):\s+(.+)$")


def from_text(raw: str, session_id: str) -> Session:
    """'Name: message' per line, optionally prefixed with 'YYYY-MM-DD HH:MM'. Untimed lines are spaced 20s apart."""
    people: dict[str, str] = {}
    msgs: list[Message] = []
    clock = 0.0
    for i, line in enumerate(raw.splitlines()):
        m = _LINE.match(line)
        if not m:
            continue
        stamp, name, text = m.groups()
        clock = datetime.fromisoformat(stamp.replace(" ", "T")).timestamp() if stamp else clock + 20
        if name.strip().lower() in AGENT_NAMES:
            sender, persona = "agent", name.strip().lower()
        else:
            sender, persona = people.setdefault(name.strip().lower(), f"P{len(people) + 1}"), None
        msgs.append(Message(f"m{i}", clock, sender, text.strip(), persona))
    aliases = {name: tok for name, tok in people.items()}
    for mm in msgs:
        mm.text = _scrub(mm.text, aliases)
    return Session(session_id, msgs)


def _fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "huddle-ml"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def ingest(source: str, name: str | None = None) -> Session:
    if re.match(r"https?://", source):
        u = urlparse(source)
        m = re.search(r"/trip/([0-9a-f-]{36})", u.path) or re.search(r"/api/trip/([0-9a-f-]{36})", u.path)
        if not m:
            raise ValueError("expected a .../trip/<id> or .../api/trip/<id> URL")
        return from_api(_fetch_json(f"{u.scheme}://{u.netloc}/api/trip/{m.group(1)}"), name)
    path = Path(source)
    raw = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".json":
        d = json.loads(raw)
        if "session_id" in d and "messages" in d and "trip" not in d:
            s = Session.from_json(d)
            if name:
                s.session_id = name
            return s
        return from_api(d, name)
    return from_text(raw, name or path.stem)


def scrub_names(s: Session, names: list[str]) -> Session:
    """Blank out extra names people type into the chat (nicknames, a brother, a hotel contact)."""
    aliases = {n.strip(): "<name>" for n in names if n.strip()}
    for m in s.messages:
        m.text = _scrub(m.text, aliases)
    for p in s.preferences:
        p["value"] = _scrub(p["value"], aliases)
    return s


def save(s: Session) -> Path:
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    p = SESSIONS_DIR / f"{s.session_id}.json"
    p.write_text(json.dumps(s.to_json(), indent=1, ensure_ascii=False), encoding="utf-8")
    return p


def load_all(directory: Path | None = None) -> list[Session]:
    d = directory or SESSIONS_DIR
    return [Session.from_json(json.loads(p.read_text(encoding="utf-8"))) for p in sorted(d.glob("*.json"))]
