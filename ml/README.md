# huddle_ml — learn when Huddle should speak, and what a group likes

Standalone. Nothing in the Next app imports this folder, and it never touches the dashboard or the live bot.
You drop in chat sessions, it trains on them.

Today Huddle's judgment is hand-written: prompt rules in `lib/agents/chimein.ts`, plus fixed lull/cooldown timers
in `lib/agents/spokesperson.ts`. This folder learns those judgments from real chats instead.

## What it learns

| Model | Question it answers | Where it would plug in |
|---|---|---|
| **timing** | Right after this human message, should Huddle speak? | replaces the chime-in guess and the "wait for a lull" gate |
| **draft** | Will this drafted message land, or is it a repeat / ignored? | a last check before a queued message posts |
| **taste** | What does this group like, and how do they want Huddle to talk? | ranks suggestions, shapes style |

## Quick start

```bash
cd ml
python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt   # Windows; use .venv/bin/python elsewhere
PY=.venv/Scripts/python

$PY -m huddle_ml ingest https://<your-app>/trip/<id>/plan --name calgary --scrub krisha,stuti
$PY -m huddle_ml diagnose            # what went wrong in the chat
$PY -m huddle_ml train               # timing + draft models, taste profile
$PY -m huddle_ml score calgary       # replay the chat through the timing model
$PY -m huddle_ml profile             # what the group likes
python -m unittest discover -s tests
```

**Adding a session** is one `ingest` command, then `train` again. `ingest` takes any of:
a trip page URL or `/api/trip/<id>` URL (fetched live), a saved API JSON file, an already-normalized session,
or a plain-text transcript with one `Name: message` per line (optionally prefixed `2026-09-20 01:17`).
Names and phone numbers become `P1`, `P2`, …; pass `--scrub` for extra names typed inside messages.
Sessions are stored in `sessions/` and are **git-ignored** because they are real group chats.

## Where the labels come from

Nobody labels anything by hand. The chat says whether Huddle spoke well:

- **Should have spoken** — someone asked something, nobody answered, and a human then had to tag Huddle for it.
  Or Huddle spoke unprompted and the group replied to it.
- **Should have stayed quiet** — Huddle spoke and it restated an open decision in prose ("still open, need to pick") instead of one numbered list, or it was a near-duplicate of an earlier post, or got pushback
  ("we want concrete plans", "that's wrong"). Chat that simply moved on counts as silence being fine.
- **Ignored** posts are only a weak signal (they may have arrived late), so they teach the draft model but not the timing model.

Review and override them: `label <session>` lists every message with its label and reason;
`label <session> --set <id>=speak|silent` or `--post <id>=good|bad` records a hand label in `labels/<session>.json`,
which always wins over the automatic one.

## What the two sessions showed

`diagnose` on **calgary** (74 messages, 26 Huddle posts):

- **Huddle went quiet on real questions.** 8 questions ("does calgary do something for nye?", "give me a day to day plan")
  sat unanswered until someone typed `@huddle`. Once tagged, Huddle replied in about 12 s, so the delay was
  the decision to speak, not the reply. The lull gate adds delay on top: a chime-in queued at 00:32:01 (about "lake louise")
  was only posted at 00:37:49, after the group had already tagged Huddle for the same thing.
- **It nagged.** Five near-duplicate posts ("banff day trip is still open…" x4, the same world-juniors list twice).
- **Pushback once**, for handing over ranges instead of a concrete day-by-day plan. Only 2 of 11 unprompted posts drew a reply.

`diagnose` on **trip-e271507d** (203 messages, 96 Huddle posts, LA then Tahoe):

- **Nobody trusted it to speak up.** 35% of human messages tag Huddle (45 tags) and only 4 of Huddle's posts were unprompted, none engaged with.
- **Sign-off spam.** "that's sorted, i'm out" was posted 6 times and "That's settled, so I'm heading out" 3 times.
  Also "group created" 4 times, because the chat was reset more than once (this transcript spans several trips).
- **A 58-minute silence.** After Huddle said "going quiet", the group tagged it for about an hour without an answer
  ("huddle is going insane"). Pause worked as designed, but nothing let a direct tag through.
- **Real unanswered asks:** ticket prices, "hotels are too expensive, need 60-70 pp", "what are some cheap eats".
- **Taste across both:** hiking/nature, culture and food drew enthusiasm; repeated zoo days were rejected;
  one person's spend mood is strongly frugal in the LA trip.

## Read the numbers with care

Two sessions (88 timing examples, 119 draft examples) is still a smoke test, and the honest result is that **the models do not beat simple rules yet**:

- **timing:** leave-one-session-out precision 1.0 / recall 0.62, versus the plain rule *speak on any real question* at 1.0 / 0.84.
  The labels and the model share a cue (is this a question?), and with only two chats the model generalizes worse than the rule. `train` prints the rule as "the bar to beat".
  The model only earns its keep once sessions contain cases where the rule is wrong (a question others already answered, a statement that needed a reply). Hand labels are the fastest way to add those.
- **draft:** precision 0.42 / recall 0.91 at a low threshold. Good enough to flag repeats (`repeat_sim` is the strongest signal), not to gate on quality.
- Expect real signal after roughly 20 sessions. With one session validation is 4 blocks of that session; with two or more it is leave-one-session-out.
- Sessions that span several trips (a chat reset in the middle) are treated as one; splitting at "group created" would be cleaner.
- Typos ("skiiing") are missed by the keyword-based taste lexicon.

## Using it from the app (not wired up)

Nothing calls this yet. The interface is a JSON pipe, so a TS hook can shell out or wrap it later:

```bash
echo '{"messages":[{"sender":"P1","text":"what is there to do in banff?","t":1758000000}],
       "draft":"banff has skiing at lake louise"}' | $PY -m huddle_ml predict
# {"timing": {"speak": true, "p": 0.99, "threshold": 0.8, "why": "information request, ..."},
#  "draft":  {"send": true, "p": 0.71, "threshold": 0.45}}
```

The threshold favors precision (F0.5): silence is Huddle's default, so a wrong interruption costs more than a miss.

## Layout

```
huddle_ml/session.py    ingest + anonymize; normalized session format
huddle_ml/labeling.py   outcome-based labels, hand overrides, the diagnose report
huddle_ml/features.py   timing + draft features
huddle_ml/models.py     class-balanced logistic regression, CV, threshold, predict
huddle_ml/taste.py      per-person and group preference profile, suggestion ranking
huddle_ml/cli.py        the commands above
sessions/  labels/  models/   your data, hand labels, trained artifacts
```
