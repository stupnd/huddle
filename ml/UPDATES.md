# Updates

A plain-English log. Each time a chat is added, we note what Huddle got wrong in it and whether the model got better.
Add a new entry at the top after every `ingest` + `train`.

---

## Update 3: feedback from the Calgary chat (no new chat)

**What people said**
- Huddle's replies about open decisions sounded robotic and were overwhelming. It kept saying things like "banff day trip is still open, need to pick one or replan", one message per decision, again and again.
- They wanted one simple list instead, most important first, like:
  1. Skiing - is it happening?
  2. Johnston Canyon full day tour - which date?
- They wanted to answer each item on its own, and have Huddle reply right under that answer to confirm it, or ask again if the answer was vague.

**What we changed in the bot**
- Open decisions now go out as one short numbered list, at most 4 items, most important first. It goes out rarely (not more than once every 6 hours, and never the same list twice in a day).
- Anyone can ask "@huddle what's left?" to get the list right away.
- When someone answers an item ("1: yes, jan 4" or just "yes let's ski jan 4"), Huddle replies under their message: "Skiing: yes, jan 4, locked in". If the answer was vague, it asks one short follow-up instead.
- Huddle's chime-in mode is now told never to bring up open decisions itself, so the list is the only place they come up.
- Real iMessage threads work through Claw. Sendblue has no reply-to option in its documented API, so there the reply is a normal message.

**What we changed in the model folder**
- Added a new bad-behavior label, "nag": an open decision restated in prose instead of the numbered list. `diagnose` now counts them: 7 in the Calgary chat and 3 in the LA / Tahoe chat.

**Did the model get better?**
- We can't say. The labels changed (nags now count as bad), so the new numbers are not comparable with the old ones.
- Timing model: right 82% of the times it says "speak", and finds 92% of the moments to speak. The simple rule is at 87% and 88%. Still a tie, not a win.

---

## Update 2: added the LA / Tahoe chat (203 messages)

**What we learned from this chat**
- People did not trust Huddle to speak up. About 1 in 3 messages was someone tagging Huddle by hand. Huddle spoke first only 4 times, and nobody answered it.
- Huddle said goodbye over and over. "that's sorted, i'm out" came 6 times, and "that's settled, so I'm heading out" came 3 times.
- Huddle went quiet on request, and then ignored people for almost an hour. They tagged it many times and got no answer. One wrote "huddle is going insane".
- Real questions went unanswered: ticket prices, "hotels are too expensive, we need 60-70 per person", "what are some cheap eats".
- What this group likes: hiking and nature, culture, food. One person was very careful with money on this trip.

**Did the model get better?**
- Not really. And that is the honest answer.
- With two chats, we can now test the model on a chat it has never seen. That is a fairer test.
- The timing model finds 62% of the moments Huddle should speak in. A simple rule ("speak whenever someone asks a real question") finds 84%. So the rule still wins.
- The "will this message land?" model is good at spotting repeats, but not at judging quality. It is right about 4 times in 10 when it says a message is good.

**What we changed because of this chat**
- Stopped counting the "group created" notice as Huddle talking.

---

## Update 1: first chat, Calgary trip (74 messages)

**What we learned from this chat**
- Huddle stayed quiet on real questions. 8 questions went unanswered until someone typed `@huddle`. Once tagged, Huddle answered in about 12 seconds. So the problem was deciding to speak, not being slow to reply.
- The "wait for a quiet moment" rule made it worse. One reply was ready at 00:32 but only posted at 00:37, after the group had already asked again.
- Huddle nagged. It sent "banff day trip is still open" four times, and the same list of events twice.
- Huddle gave ranges ("roughly Dec 26 to Jan 5") when the group wanted a concrete day-by-day plan. They told it so.
- What this group likes: the Fairmont hotel, Lake Louise, skiing. They did not want to do the zoo for many days. One person went from "I don't want to spend too much" to "make it the most expensive trip".

**Did the model get better?**
- This was the starting point, so there was nothing to compare with yet.
- The model looked great (it found 83% of the moments to speak, and never spoke when it shouldn't). But the simple rule scored almost the same (80%), and we could only test on the same chat we trained on. So it proved the pipeline works, not that the model is smart.

**What we changed because of this chat**
- Fixed a mistake where "I don't wanna spend too much" was read as a complaint about Huddle.
- A push-back like "we want concrete plans" now counts before the repeat check.
- If someone asked Huddle for a list, giving a similar list again only counts as a repeat when it is nearly identical.

---

## The scoreboard

| | Timing model finds the moments to speak | Simple rule finds them | Message-quality model right when it says "good" |
|---|---|---|---|
| After chat 1 | 83% (tested on its own chat) | 80% | 63% |
| After chat 2 | 62% (tested on an unseen chat) | 84% | 42% |

The numbers went down, but the test got fairer, so the drop is honesty, not damage. The model has not beaten the simple rule yet.

## What will make it better
1. More chats. About 20 would start to show real patterns. Two is not enough.
2. Hand labels on the tricky cases: a question the group answered themselves (Huddle should stay quiet), or a statement that really needed a reply (Huddle should speak). Use `label <session> --set <id>=speak|silent`.
3. Splitting chats that cover several trips, so each trip is one session.
