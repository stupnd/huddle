# Huddle PRD

**Product:** Huddle, a multi-agent trip planner that lives in your iMessage group chat  
**Team:** Stuti Pandya, Krisha Veera  
**Status:** Draft v4  
**Last updated:** September 16, 2026

---

## 1. Summary

Huddle is an AI planning presence that friends add to their existing iMessage group chat when planning a trip. It listens quietly, keeps track of what each person wants, works on logistics and budget in the background, and only speaks up in the chat when it is actually needed. When a decision needs expertise or a debate, Huddle brings specialist agents into the group chat as their own members, and they leave once the job is done. A companion app shows the group exactly where the plan stands: everyone's preferences, open decisions, conflicts, and the current plan with a per-person cost split.

**One-line pitch:** Your group chat stays a group chat. Huddle quietly keeps track of what everyone wants and shows you where the plan stands.

---

## 2. Problem

Planning a group trip usually falls on one person. The group chat fills with "when is everyone free" messages, preferences get mentioned once and forgotten, and decisions get buried in the scroll.

Existing AI tools make some of this worse:

- **They talk too much.** Chat assistants reply to every message or every tag, which clutters the group chat instead of helping it.
- **They don't track individuals.** A single assistant reacts to the latest message but never builds a clear picture of who wants what.
- **The chat is the only output.** Plans live inside the conversation, so the original problem (things getting lost in the scroll) remains.
- **They are built for solo travelers.** Personal travel agents are great for one person's bookings but do not coordinate six people with six budgets.

---

## 3. Market Landscape

| Product | What it does | Gap Huddle fills |
|---|---|---|
| Soar Travel | Personal travel agent over iMessage that learns from your inbox, books, and auto checks in | Solo only; no group coordination or shared preferences |
| Expedia Romie | AI assistant invited into group chats for trip planning | Single chatty assistant; tied to Expedia booking |
| Sidekicks, Continua | General AI members of group chats | Not trip specific; no structured preference tracking or plan view |
| Wanderlog, Stippl, TripJam, WePlanify | Collaborative itinerary and budget apps | Everyone must leave the group chat and enter data manually |
| Splitwise | Expense splitting | Only handles money after the fact |

**Positioning:** Huddle combines the native feel of an iMessage agent with a structured, group-level view that no chat-only assistant offers. Its core differentiators are judgment about when to speak, per-person preference tracking, and a dashboard that shows the state of the plan.

---

## 4. Product Principles

1. **The group chat stays human.** Huddle listens to everything and speaks rarely. Silence is the default.
2. **Speak when needed, not when tagged.** Huddle interrupts only when it adds real value, and anyone can still tag it directly.
3. **Remember everyone.** Every stated preference is captured, attributed to a person, and traceable back to the message it came from.
4. **The app shows where we are.** Detail lives in the dashboard; the chat gets short updates with a link.
5. **Humans decide.** Agents recommend and surface tradeoffs, but the group makes final calls.
6. **Trust is earned.** Everyone knows an AI is reading the chat, and each person can see and correct what Huddle thinks they want.
7. **The app actually does something.** Unlike companion apps that only mirror the chat, the Huddle app is where you see where the group stands, how the agents reasoned, and every past trip.
8. **Planning should be fun.** Agents with personalities that argue it out make planning entertaining to watch, not just efficient.
9. **Agents are real members of the chat.** Specialist agents join the group chat as their own contacts when they're needed and leave when their job is done, like bringing a friend in who knows the topic.

---

## 5. Target Users

**Primary:** Friend groups of 3 to 10 people planning a shared trip (weekend getaways, reading week trips, grad trips, bachelorettes), mostly on iPhone.

**Early wedge:** University students in Canada. Trips are budget constrained, budgets vary widely within a group, and planning happens entirely in group chats. Most competitors are US first.

**Roles in a trip:**

| Role | Description |
|---|---|
| Organizer | Adds Huddle to the group chat and starts the trip |
| Participant | Chats normally, can check and edit their preferences in the app, can steer Huddle |
| Huddle (spokesperson) | Permanent, visible AI member of the group chat; the host that moderates debates and decides when to speak |
| Budget agent | Permanent, visible AI member of the group chat; does cost math in the background and speaks up when money matters |
| Child agents | Temporary specialists (stays, flights, food, activities, and so on) spawned on demand, added to the group chat as their own members, who talk, debate, and leave when their task is done |
| Background agents | Permanent, invisible: the listener and orchestrator, which work behind the scenes and never post |

**Agent types at a glance:**

| | Permanent for the whole trip | Temporary |
|---|---|---|
| **Visible in the group chat** | Huddle, Budget agent | Child agents |
| **Invisible** | Listener, Orchestrator | None |

---

## 6. Goals and Non-Goals

### Goals (MVP)

- Huddle works inside a real iMessage group chat as an added contact
- Preferences are extracted automatically and shown per person in the app
- An orchestrator spawns specialist agents that join the group chat, talk and debate, and leave when done
- The budget agent keeps a per-person cost split from shared state and speaks in the chat when money matters
- Huddle speaks unprompted only when a defined trigger fires, and stays silent otherwise
- A presentable live demo on a real trip with real friends

### Non-Goals (MVP)

- Booking or payments inside Huddle (links out to booking sites instead)
- Android-first experience (Android members get a web link to the dashboard)
- Multiple simultaneous trips per group chat
- Calendar or email integrations
- Automatic final decisions without human confirmation
- A native iOS app (companion app is a mobile web app first)

---

## 7. Success Metrics

### Demo-day bar

- Huddle receives and processes every message in a real group chat of at least 3 people
- At least 5 preferences are correctly captured and attributed to the right people during a real planning conversation
- Huddle posts unprompted at least once for a real conflict or stuck decision, and stays silent during casual banter
- The dashboard reflects the current plan and per-person costs within a few seconds of changes
- A group reaches a decision on the trip with Huddle's help

### Product metrics (post-MVP)

| Metric | Target direction |
|---|---|
| Preference extraction accuracy (confirmed vs edited by users) | Above 85 percent confirmed |
| Unprompted messages per 100 human messages | Low, roughly 2 to 5 |
| Unprompted messages reacted to positively or acted on | Above 60 percent |
| "Chill" or mute commands per trip | Trending down |
| Trips that reach a confirmed plan | Majority of started trips |
| Participants who open the dashboard at least once | Above 50 percent |

---

## 8. Core User Flows

### 8.1 Starting a trip

1. The organizer texts Huddle's number directly or adds it to an existing group chat.
2. Huddle posts one short intro: what it does, that it reads the chat to help plan, how to quiet it, and a link to the dashboard.
3. Each participant receives a personal link to opt in and set a display name.
4. The organizer (or anyone) describes the trip: "Montreal, reading week, 5 of us."

### 8.2 Normal planning conversation

1. Friends chat as usual.
2. The listener agent extracts preferences, constraints, open questions, and decisions from each message and updates shared state.
3. The orchestrator and budget agent react to state changes in the background, and the orchestrator spawns child agents when needed.
4. Huddle, the budget agent, and any child agents in the chat evaluate whether anything is worth saying. Most of the time, they stay silent.

### 8.3 Huddle speaks up

1. A trigger fires, for example a budget conflict.
2. The spokesperson waits for a lull in the conversation.
3. It posts a short message, such as: "Heads up: the hotel everyone liked puts Arjun over his budget. Two cheaper options are on the dashboard."
4. The group responds and the listener captures the outcome.

### 8.4 Checking the dashboard

1. A participant opens the link.
2. They see their own captured preferences and can confirm, edit, or remove each one.
3. They see group constraints, open decisions, conflicts, current options, and their cost share.

### 8.5 Steering and controls

- Tag Huddle directly at any time for questions or instructions ("Huddle, find something under $150 a night").
- Text "Huddle chill" to reduce unprompted messages, or "Huddle be more active" to increase them.
- Text "Huddle pause" to stop all unprompted messages until resumed.

---

## 9. Functional Requirements

### 9.1 iMessage integration

| ID | Requirement |
|---|---|
| FR-1 | Huddle is reachable as a contact via an iMessage relay provider that supports group chats |
| FR-2 | Every message in a group chat that includes Huddle is delivered to the backend via webhook |
| FR-3 | Huddle can post text and links into the group chat through the provider API |
| FR-4 | Huddle maps sender phone numbers to participant records |
| FR-5 | Huddle posts a clear intro on joining and explains how to quiet or remove it |

### 9.2 Listener agent

| ID | Requirement |
|---|---|
| FR-6 | Processes every incoming message and never posts in chat |
| FR-7 | Extracts preferences (dates, budget, lodging, flights, food, activities, dislikes) and attributes each to a participant |
| FR-8 | Stores each preference with a link to the source message and a confirmed or unconfirmed status |
| FR-9 | Detects open questions, proposed options, and decisions the group has made |
| FR-10 | Updates existing preferences when someone changes their mind instead of duplicating them |

### 9.3 Specialist agents (logistics)

| ID | Requirement |
|---|---|
| FR-11 | Proposes destinations, flights or transport, stays, and activities based on group constraints |
| FR-12 | Uses search tools and place data for real prices, availability, and ratings |
| FR-13 | Re-evaluates options when constraints change |
| FR-14 | Writes options to shared state with reasoning, and speaks in the group chat when added as a member (see 9.7) |

### 9.4 Budget agent

| ID | Requirement |
|---|---|
| FR-15 | Estimates total and per-person cost for each option |
| FR-16 | Checks each option against every participant's budget |
| FR-17 | Flags conflicts when an option exceeds anyone's budget |
| FR-18 | Supports uneven splits (for example, someone skipping an activity) |
| FR-18a | Is a permanent member of the group chat with its own contact, name, and personality, added alongside Huddle when the trip starts |
| FR-18b | Stays silent by default and speaks when money matters: an option goes over someone's budget, the total jumps, a cheaper equivalent exists, or someone asks about cost |
| FR-18c | Can join debates, usually as the voice of savings, pushing back on pricey options |
| FR-18d | Never reveals a private budget in chat; phrases conflicts without numbers ("this is above at least one person's budget") |
| FR-18e | Follows the shared cooldown and lull rules like every other visible agent |

### 9.5 Spokesperson

| ID | Requirement |
|---|---|
| FR-19 | Is the permanent AI voice in the group chat and gates every agent message (its own and specialist agents') through shared cooldowns and debate rules |
| FR-20 | Decides whether to speak using the triggers and guardrails in Section 10 |
| FR-21 | Always responds when directly tagged |
| FR-22 | Keeps messages to 1 to 3 lines and links to the dashboard for details |
| FR-23 | Logs every decision to speak or stay silent, with a reason |

### 9.6 Companion dashboard

| ID | Requirement |
|---|---|
| FR-24 | Shows each participant's preferences, grouped by category, with source messages |
| FR-25 | Lets participants confirm, edit, or delete their own preferences |
| FR-26 | Shows group constraints: shared date range, budget ceiling, hard no's |
| FR-27 | Shows open decisions and active conflicts |
| FR-28 | Shows current options, the current pick, and per-person cost split |
| FR-29 | Updates in real time as state changes |
| FR-30 | Shows an agent activity log, including moments Huddle chose not to speak |
| FR-31 | Shows and edits the group's activity level (quiet, normal, active, paused) |
| FR-32 | Works on mobile browsers, including for Android participants |
| FR-33 | Shows a trip history: every past trip with its final plan, decisions, costs, and who went |
| FR-34 | Shows a decision timeline for the current trip: what was proposed, debated, and chosen, and when |
| FR-35 | Shows a debate view with full agent arguments for each debated decision |
| FR-36 | Uses preferences from past trips as suggested starting preferences for new trips (each person confirms) |

### 9.7 Dynamic agents and debates

| ID | Requirement |
|---|---|
| FR-37 | An orchestrator spawns specialist child agents on demand based on what the trip needs (for example a stays agent, a flights agent, a food agent, a nightlife agent) |
| FR-38 | Child agents are torn down when their task is resolved |
| FR-39 | For contested decisions, the orchestrator spawns competing agents that each argue for a different option |
| FR-40 | Each child agent has a name, role, distinct personality, and its own contact card (name and photo) so friends can tell them apart |
| FR-41 | Each child agent is its own iMessage participant with a dedicated handle, added to the group chat when spawned |
| FR-43 | When an agent joins, it posts a one-line intro explaining why it's there ("Hi, I'm Nova, the stays agent. You three can't agree on where to sleep, so I'm here.") |
| FR-44 | Child agents can talk directly in the chat: answer questions in their area, respond to people, and debate other agents |
| FR-45 | When its task is resolved, a child agent posts a short sign-off and leaves the group chat |
| FR-46 | Child agents share the group's cooldown and activity level, coordinated by the orchestrator so agents don't talk over each other |
| FR-47 | If an agent cannot be added to the chat (provider limits, SMS participants), it falls back to posting through the main Huddle contact with its name as a prefix |
| FR-42 | Every debate ends with a clear summary of the options and tradeoffs, and the group decides |

---

## 10. Speak-When-Needed Specification

This is the core of the product experience.

### 10.1 Triggers (reasons to speak)

| Trigger | Example | Urgency |
|---|---|---|
| Direct tag | "Huddle, what's the cheapest weekend?" | Always responds |
| Constraint conflict | Two people's dates or budgets cannot both be satisfied | High |
| Time-sensitive change | A tracked fare jumps or a favorited stay is nearly sold out | High |
| Decision ready | Enough people have weighed in to propose a choice | Medium |
| Stuck loop | Same question discussed repeatedly with no resolution | Medium |
| Unanswered question | A logistics question sits unanswered for a while | Low |
| Milestone | The plan is complete and needs a final thumbs up | Medium |

### 10.2 Reasons to stay silent

- Casual conversation, jokes, memes, or side topics
- People are already answering each other
- Huddle posted recently and nothing urgent has changed
- The information is useful but not decision relevant (it goes to the dashboard only)
- The group has set Huddle to paused

### 10.3 Decision logic

1. Each state change produces candidate messages with a trigger type and urgency score.
2. The spokesperson (or the specialist agent that owns the topic) scores each candidate on urgency, relevance to the group, and how much value it adds beyond what the dashboard already shows.
3. A candidate posts only if its score passes the threshold for the group's activity level.
4. Low-scoring candidates are logged and surfaced on the dashboard instead.

### 10.4 Guardrails

| Guardrail | MVP default |
|---|---|
| Lull detection | Wait until the chat is quiet for about 90 seconds before posting, unless urgent |
| Cooldown | At most one unprompted message every 30 minutes, unless urgent |
| Batching | Combine multiple pending updates into one message |
| Length | 1 to 3 lines plus a dashboard link |
| Agent loop cap | Background agents limited to a fixed number of turns per human message |
| Quiet commands | "chill", "be more active", "pause", "resume" |

### 10.5 Agents joining the group chat

Huddle is the permanent member of the chat. Specialist agents are brought in only when needed, speak for themselves, and leave when done.

**Lifecycle:**

1. **Spawn:** The orchestrator decides a specialist is needed (for example, the group has gone back and forth about where to stay).
2. **Join:** The agent is added to the group chat from a pool of agent handles, with its own name and contact photo.
3. **Intro:** It posts one line saying who it is and why it joined.
4. **Work:** It answers questions in its area, reacts to what people say, and debates other agents when a decision is contested.
5. **Handoff:** Its conclusions are written to shared state and appear on the dashboard.
6. **Leave:** Once the decision is made, it posts a quick sign-off and leaves.

**Rules that keep it from getting chaotic:**

| Rule | MVP default |
|---|---|
| Max child agents in chat at once (besides Huddle and the budget agent) | 2, or 3 during a debate |
| Who can join agents | Only the orchestrator; any person can also request one ("Huddle, bring in someone for food") |
| Who can remove agents | Anyone, by texting "Nova, you can go" or removing the contact |
| Talking | Agents follow the same speak-when-needed triggers, lull detection, and shared cooldown as Huddle |
| Idle timeout | An agent that has nothing to add for a set period leaves on its own |

**Example lifecycle in the group chat:**

> *Huddle added Nova (Stays) and Rio (Stays) to the conversation*
> **Nova:** Hi, I'm Nova. I think you should stay in the Plateau. Rio disagrees. We'll be quick.
> **Rio:** Downtown saves the group $190 total. Walkability is nice but so is money.
> **Nova:** Two of you said you don't want to Uber everywhere though.
> **Huddle:** Walkability vs savings. Vote 🏙️ Plateau or 💸 Downtown.
> *(group votes Plateau)*
> **Nova:** Plateau it is. Booking links are in the app. Bye!
> *Rio left the conversation. Nova left the conversation.*

### 10.6 Agent debates

Competing agents arguing for the job is part of Huddle's personality and a big part of why it's fun. Since the agents are real members of the chat, debates follow their own rules so they stay entertaining rather than noisy.

**When a debate happens:** Only for real decisions with meaningful tradeoffs, such as which neighborhood to stay in, a cheap hostel versus a nicer hotel, or flying versus taking the train.

**How it plays out:**

1. The orchestrator spawns 2 or 3 agents, each assigned one option to champion, and adds them to the group chat.
2. Each agent researches its option and builds its case against the group's preferences.
3. Agents post short, punchy arguments and rebuttals, capped at a small number of rounds.
4. Huddle, as moderator, closes with a summary and asks the group to vote.
5. The winning agent confirms the outcome, and the debating agents leave the chat.
6. The full back-and-forth is saved to the debate view in the app.

**Debate modes (set per group):**

| Mode | Behavior |
|---|---|
| Off | Agents don't join the chat for debates; debates run in the background and Huddle posts the summary |
| Highlights | Agents join, post an opening argument each, Huddle calls the vote; full debate in the app |
| Full (default) | Agents join and the whole debate plays out in chat, within round limits |

**Debate guardrails:** A maximum number of rounds, one active debate at a time, debates only start after a lull, and anyone can end one early by texting "Huddle, just pick" (which returns a recommendation for the group to confirm) or "Huddle, stop".

---

## 11. Privacy and Trust

- **Opt-in:** Huddle announces itself on joining, and each participant opts in through their personal link. Messages from people who have not opted in are not used to build profiles.
- **Private budgets (proposed default):** Budgets are private by default. Agents plan around them, and conflicts are phrased without revealing the number ("this option is above at least one person's budget"). Participants can choose to share their budget with the group.
- **Transparency:** Every preference links back to the message it came from, and people can correct or delete anything about themselves.
- **Data handling:** Messages are stored only for active trips, with a clear delete option for the whole trip. No selling of data and no use for model training.
- **Removal:** Anyone can remove Huddle from the chat at any time.

---

## 12. System Architecture

```
iMessage group chat
      |
iMessage relay provider (webhook in, API out)
      |
Backend API (Next.js API routes or serverless functions)
      |
Supabase (Postgres + Realtime)  <----->  Companion dashboard (Next.js)
      |
Agent pipeline
  Invisible, permanent
  1. Listener (fast, small model): extracts state from every message
  2. Orchestrator: decides which child agents the trip needs
       |-- spawns child agents on demand (stays, flights, food, activities...)
       |-- spawns competing agents for contested decisions (debates)
  Visible, permanent (in the group chat)
  3. Huddle / moderator (decides whether and what to post, runs debates)
  4. Budget agent (cost math in background, speaks when money matters)
  Visible, temporary (in the group chat)
  5. Child agents (join, talk, debate, leave)
```

### 12.1 Dynamic agent spawning

Instead of a fixed logistics agent, an orchestrator reads the trip state and creates specialist agents as needed. A beach weekend might spawn stays and activities agents, while a Europe trip adds a flights agent and a transit agent. Each child agent gets a scoped task, the relevant slice of shared state, its own tools, and a turn budget. When the task is resolved, it is retired and its output stays in shared state and history.

The listener, orchestrator, Huddle, and budget agent stay permanent because they apply to every trip. Huddle and the budget agent are visible members of the chat from the start. Spawned child agents are temporary participants: each one is assigned a handle from an agent pool, added to the group, and speaks for itself. The orchestrator still coordinates turn-taking, so every agent message passes a shared check for cooldowns, debate mode, and length limits before it sends.

### 12.2 Agent handle pool

- Huddle maintains a pool of iMessage handles (phone numbers or email addresses) through the relay provider, each able to act as any agent persona.
- When an agent spawns, it borrows an available handle, sets its display name and contact photo, and is added to the group.
- When it leaves, the handle returns to the pool. A group sees consistent names and photos for the same agent role within a trip.
- Pool size limits how many agents can be active across all groups at once, which also acts as a natural cost cap.

**Technical assumption to validate first:** The relay provider must support programmatically adding a handle to an existing group chat and having it leave. iMessage also has restrictions on removing or leaving members in small groups, and group chats that include SMS participants cannot add members at all. If adding members isn't supported, the fallback is FR-47: agents speak through the main Huddle contact with a name prefix, so the experience degrades gracefully instead of breaking.

**Event flow:** A new message arrives via webhook, gets stored, and triggers the listener. Listener writes to state. State changes trigger the orchestrator and budget agent through database events. The orchestrator spawns specialist agents and adds them to the chat when needed. Any meaningful change creates a speak candidate for Huddle, the budget agent, or the relevant child agent, checked against shared cooldowns before posting.

**Why event driven:** Database-triggered agents avoid constant polling, lower API costs, and feel more live.

---

## 13. Data Model

| Table | Key fields |
|---|---|
| trips | id, group_chat_id, title, destination, date_range, activity_level, status, created_at |
| participants | id, trip_id, phone_hash, display_name, opted_in, joined_at |
| messages | id, trip_id, participant_id, sender_type (human, huddle), content, created_at |
| preferences | id, trip_id, participant_id, category, value, visibility (private, group), source_message_id, confirmed, updated_at |
| constraints | id, trip_id, type, value, derived_from (preference ids) |
| agents | id, trip_id, role, persona_name, avatar_url, handle_id, spawned_for (task or decision id), status (active, in_chat, left, retired), joined_at, left_at |
| agent_handles | id, provider, address, in_use, current_agent_id |
| debates | id, trip_id, decision_id, agent_ids, rounds (json), summary, outcome_option_id, mode |
| options | id, trip_id, type (stay, transport, activity), details (json), total_cost, per_person_costs (json), created_by_agent, status |
| decisions | id, trip_id, topic, status (open, debating, proposed, decided), chosen_option_id, decided_at |
| conflicts | id, trip_id, description, participants_involved, status |
| speak_log | id, trip_id, trigger_type, score, posted (bool), reason, message_id, created_at |

---

## 14. Tech Stack

| Layer | Choice |
|---|---|
| Messaging | iMessage relay provider with group chat support (evaluate Linq, Sendblue, Photon, LoopMessage) |
| Backend | Next.js API routes or serverless functions |
| Database and realtime | Supabase (Postgres, Realtime, database webhooks) |
| Agents | Claude API: a fast small model for the listener, a stronger model for the orchestrator, specialist agents, budget, and spokesperson |
| Travel data | Search tool plus a places API for prices, hours, and ratings |
| Dashboard | Next.js mobile-first web app |
| Hosting | Vercel |

---

## 15. Non-Functional Requirements

- **Latency:** Dashboard updates within a few seconds of a message; direct tag replies within about 10 seconds.
- **Cost:** Runs on free or low-cost tiers during MVP; listener uses the cheapest viable model since it runs on every message.
- **Reliability:** Webhook failures are retried and never cause duplicate posts.
- **Access:** Dashboard access via signed personal links; no full accounts in MVP.
- **Devices:** Works on iPhone and Android mobile browsers.

---

## 16. Milestones

| Phase | Scope | Exit criteria |
|---|---|---|
| Weekend 1 | Relay provider setup, receive group messages, reply to direct tags, store messages in Supabase. Test adding a second permanent handle (budget agent) and adding and removing a temporary handle from a group chat | Huddle responds to a tag in a real group chat, and a second agent handle can join and leave |
| Weekend 2 | Listener agent, participants and preferences tables, basic dashboard showing preferences | Preferences from a test chat appear correctly per person |
| Weekend 3 | Orchestrator with dynamic spawning of child agents that join and leave the chat, budget agent as a visible chat member, options and cost split on dashboard | Changing a budget in chat changes options and splits; different trips spawn different agents |
| Weekend 4 | Spokesperson with triggers, scoring, cooldowns, quiet commands, speak log, and agent debates in full mode | Huddle speaks for a conflict, stays silent during banter, and runs one debate to a group vote |
| Weekend 5 | Trip history, decision timeline, and debate view in the app | A finished trip appears in history with its full timeline |
| Weekend 6 | Real trip test with friends, tuning thresholds, polish | Group reaches a decision with Huddle; feedback collected |

---

## 17. Demo Script

1. Show a messy real-looking group chat trying to plan a trip.
2. Add Huddle to a fresh group chat of 3 or more real people.
3. Chat naturally: dates, a budget comment, a food preference, some jokes.
4. Open the dashboard and show each person's preferences appearing with their source messages.
5. Point out that Huddle stayed silent through the banter, and show the speak log explaining why.
6. Introduce a conflict, like one person's budget versus the popular hotel. Huddle speaks up with a short message.
7. Someone redirects: "Huddle, find something walkable under $150 a night." Two stays agents get added to the group chat live.
8. The agents introduce themselves, debate in the chat, and Huddle calls a vote. After the vote, they sign off and leave.
9. The group votes. Open the app to show the debate view and the decision timeline.
10. End on the dashboard showing the final plan and per-person split, then flip to trip history.

---

## 18. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Relay providers are not officially supported by Apple and could break | Keep messaging behind an adapter so providers are swappable; dashboard works independently |
| Huddle speaks at the wrong time and annoys the group | Conservative default thresholds, quiet commands, speak log for tuning, real user testing |
| Preference extraction errors | Confirm and edit controls, source message links, unconfirmed status by default |
| Privacy discomfort with an AI reading the chat | Clear intro, opt-in, private budgets, easy deletion and removal |
| Android participants break the iMessage experience | Web dashboard for all; test green-bubble behavior with provider early |
| API costs from listening to every message | Small model for listener, event-driven agents, loop caps |
| Relay provider can't add or remove agent handles in group chats | Validate in weekend 1; fall back to name-prefixed messages through the main Huddle contact |
| Agents joining and leaving feels intrusive (join notifications, too many members) | Cap agents in chat, require a clear reason in each intro, idle timeout, anyone can dismiss an agent |
| Agent debates feel spammy or costly | Highlights mode by default, round caps, one debate at a time, turn budgets per spawned agent |
| Spawned agents multiply API and handle costs | Orchestrator caps active agents per trip; shared handle pool; agents leave when tasks resolve |
| Crowded market | Focus on the group-state wedge and student trips; validate with 10 to 15 user interviews |

---

## 19. Brand and Marketing

- **Tone:** Playful, social, and a little chaotic in a good way. Travel planning is inherently fun to show, and agents arguing over where you should stay is naturally shareable content.
- **Tagline in the app footer:** "made by girls who just wanna have fun"
- **Content angle:** Short-form videos of agents joining a real group chat, debating, and leaving, screenshots of funny agent arguments, and before/after of a messy group chat versus a finished Huddle plan.
- **Positioning against solo agents:** Soar has an app that mostly mirrors the chat. Huddle's app is the dashboard, the debate replays, and the history of every trip your group has taken.
- **Launch plan:** Technical MVP first. Marketing work starts once a real trip test has produced demo-worthy moments.

---

## 20. Open Questions

1. Should budgets be private by default, shared by default, or chosen per person at opt-in?
2. How should Huddle resolve conflicting constraints when both people feel strongly: always surface to the group, or suggest a compromise first?
3. Should Huddle ever propose a final pick, or only narrow options?
4. Which relay provider best supports group chats at student-friendly cost?
5. What is the right default cooldown and lull time, and should it adapt to how active the group is?
6. When is the right time to add booking links or affiliate revenue?
7. Should the companion eventually be a native iOS app or iMessage extension, or does the web dashboard stay enough?
8. What is the right default debate mode, and how do we tune it so debates feel fun rather than noisy?
9. How many child agents can a trip spawn at once before cost or chat clutter becomes a problem?
10. Should agent personas be consistent across trips so groups get attached to them, or fresh each time?
11. Should debating agents have access to private budgets, and how do they argue without revealing them?
12. Which relay providers support adding and removing members from existing group chats, and at what cost per handle?
13. Should agents ask permission before joining ("Want me to bring in a stays agent?"), or join automatically when needed?

---

*made by girls who just wanna have fun*
