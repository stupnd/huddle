# Huddle

A multi-agent trip planner that lives in your iMessage group chat. Huddle listens quietly, tracks what everyone wants, brings in specialist agents when the group is stuck, and shows where the plan stands.

See [`docs/PRD.md`](docs/PRD.md) for the full product spec.

## What's in this MVP

| Piece | Where | What it does |
|---|---|---|
| Listener | `lib/agents/listener.ts` | Reads every message, extracts preferences and decisions. Never talks. |
| Orchestrator | `lib/agents/orchestrator.ts` | Decides when to spawn a child agent or start a debate, and retires agents when done. |
| Child agents | `lib/agents/specialist.ts` | Research options with web search, introduce themselves, and debate each other. |
| Penny (budget) | `lib/agents/budget.ts` | Checks options against everyone's budgets, speaks only when money matters, never reveals private numbers. |
| Speak gate | `lib/agents/spokesperson.ts` | Holds agent messages until the chat is quiet, enforces cooldowns and quiet commands. |
| Pipeline | `lib/pipeline.ts` | Runs all of the above for each incoming message. |
| Messaging adapters | `lib/messaging/` | `simulator` for local dev, `claw` for real iMessage via Claw Messenger, `sendblue` kept as an option. |
| iMessage worker | `worker/claw-worker.ts` | Always-on process that holds the Claw WebSocket, runs the pipeline, and posts held messages. |
| Simulator | `/sim` | A fake group chat where you can text as different friends. |
| Dashboard | `/trip/[id]` | Everyone's preferences, decisions, agents in the chat, and the speak log. |

**MVP simplification:** every agent speaks through the single Huddle line with a name prefix (`🏨 Nova (stays): ...`). Real per-agent iMessage contacts come later, once you have dedicated lines.

## Setup

1. **Install**
   ```bash
   npm install
   cp .env.example .env.local
   ```
2. **Supabase:** create a free project, open the SQL editor, and run `supabase/schema.sql`. Copy the project URL, anon key, and service role key into `.env.local`.
3. **Claude API:** add `ANTHROPIC_API_KEY`. Web search must be enabled for your organization in the Claude Console for child agents to research options.
4. **Run it**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000/sim, text as a few friends, then open the dashboard link.

## Trying it out

A good first script in the simulator:

1. **Stuti:** "ok montreal for reading week?? feb 20-23"
2. **Krisha:** "yes but i'm broke so like $300 max for everything"
3. **Priya:** "i don't want to uber everywhere, somewhere walkable pls"
4. **Arjun:** "idc where we stay as long as it's cheap lol"
5. **Stuti:** "where are we even staying tho"

Wait about 90 seconds (or press **Post held messages now**) and watch the orchestrator bring in a stays agent. Try "Huddle chill", "Huddle pause", or tagging "Penny how much is this per person".

Tune how chatty agents are with `LULL_SECONDS` and `COOLDOWN_SECONDS` in `.env.local`. For demos, set them low (15 and 60).

## Going live on iMessage (Claw Messenger)

Claw Messenger sends inbound messages over a WebSocket instead of webhooks, so real iMessage runs through a small always-on worker. The Next.js app still hosts the dashboard.

### 1. Pick a plan

| Plan | Price | Messages/month | Registered numbers |
|---|---|---|---|
| Base | $5 | 250 | 1 (can't make groups) |
| **Growth** | **$15** | **2,000** | **5 (start here)** |
| Plus | $25 | 6,000 | 20 |

Every friend's phone number must be registered to your account, or Claw ignores their messages. Growth covers a test group of 5 people. Inbound and outbound messages both count, and a busy group chat uses them fast, so watch usage in the dashboard.

### 2. Configure and run

```bash
# .env.local
MESSAGING_PROVIDER=claw
CLAW_API_KEY=cm_live_...
APP_URL=http://localhost:3000   # or your Vercel URL
```

```bash
npm run dev      # dashboard
npm run worker   # iMessage worker (keep running)
```

### 3. Start a trip

From your phone, text Huddle's number (shown in the Claw dashboard):

> start a trip with +1 613 555 0101, +1 613 555 0102

The worker registers everyone's numbers, creates a new iMessage group with all of you, and posts the dashboard link. From then on, just plan in that group chat.

**Why Huddle creates the group:** Claw can't be added to an existing group chat, so trips start with a fresh group.

### 4. Deploy

- **Dashboard:** Vercel, as normal.
- **Worker:** any always-on Node host, such as a Railway service or a Render background worker, with start command `npm run worker` (set env vars in the host instead of `.env.local`, and change the script to plain `tsx worker/claw-worker.ts`).

### Claw caveats to test early

- **Sending line can change.** Claw uses pooled lines, and its docs say the `chatId` stays stable if a group moves between lines. If a new number ever appears in your group, that's why.
- **Registered numbers cap group size** at your plan limit.
- **Conversational use only.** Rapidly messaging many new numbers can trigger a temporary throttle.

## Known MVP gaps

- **Security:** RLS is off and dashboard links are unguessable UUIDs only. Turn on RLS and signed links before real users.
- **Private preferences** show as "set privately" on the dashboard for everyone, including the owner.
- **Long agent runs** (debates) happen inline. That's fine in the Claw worker, but the simulator's API route may time out on Vercel.
- **No trip history** or per-person opt-in flow yet (both in the PRD).

---

made by girls who just wanna have fun
