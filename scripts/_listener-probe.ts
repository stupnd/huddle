import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

// Pull the real SYSTEM prompt straight out of listener.ts so the probe can't drift from the app.
const src = readFileSync("lib/agents/listener.ts", "utf8");
const SYSTEM = src.match(/const SYSTEM = `([\s\S]*?)`;/)![1];

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.LISTENER_MODEL ?? "claude-haiku-4-5-20251001";

const CONTEXT = `TRIP: Montreal, reading week
PEOPLE AND PREFERENCES:
Stuti:
- dates: Feb 20-23
Krisha:
- budget: (private)
Priya:
- nothing yet
Arjun:
- nothing yet

DECISIONS:
- none yet

CHILD AGENTS IN CHAT:
- none

RECENT GROUP CHAT:
Stuti: ok montreal for reading week?? feb 20-23
Krisha: yes but i'm broke so like $300 max for everything`;

const CASES = [
  ["Priya", "i don't want to uber everywhere, somewhere walkable pls"],
  ["Arjun", "idc where we stay as long as it's cheap lol"],
  ["Stuti", "where are we even staying tho"],
];

async function main() {
  console.log(`model: ${MODEL}\n`);
  for (const [who, text] of CASES) {
    const res = await client.messages.create({
      model: MODEL, max_tokens: 800, system: SYSTEM,
      messages: [{ role: "user", content: `${CONTEXT}\n\nNEWEST MESSAGE from ${who}:\n${text}` }],
    });
    const out = res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    console.log(`--- ${who}: "${text}"`);
    console.log(out.replace(/```json|```/g, "").trim());
    console.log();
  }
  process.exit(0);
}
main();
