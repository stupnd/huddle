/**
 * Huddle database health check.
 *
 * Verifies that every table in supabase/schema.sql exists with the columns the app reads,
 * and that Supabase Realtime actually delivers changes for each of them.
 *
 * The Realtime check is a real round trip: it subscribes with the anon key (the same path the
 * dashboard uses), inserts a throwaway row into every table, and waits for the change events.
 * A table that is missing from the supabase_realtime publication will exist but never fire.
 *
 * Run: npx tsx --env-file=.env.local scripts/check-db.ts
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const REALTIME_WAIT_MS = 10_000;

/** Columns the app actually reads or writes, per table. */
const TABLES: Record<string, string[]> = {
  trips: ["id", "provider", "provider_group_id", "title", "activity_level", "debate_mode", "last_agent_post_at", "created_at"],
  participants: ["id", "trip_id", "address", "display_name", "created_at"],
  messages: ["id", "trip_id", "participant_id", "sender_type", "persona", "content", "provider_message_id", "created_at"],
  preferences: ["id", "trip_id", "participant_id", "category", "value", "visibility", "source_message_id", "confirmed", "updated_at"],
  decisions: ["id", "trip_id", "topic", "status", "options", "chosen", "updated_at", "created_at"],
  agents: ["id", "trip_id", "kind", "role", "persona_name", "emoji", "task", "champions", "decision_id", "status", "created_at"],
  speak_candidates: ["id", "trip_id", "speaker", "trigger", "urgency", "content", "seq", "status", "reason", "created_at", "posted_at"],
};

const ok = (s: string) => `  \x1b[32mPASS\x1b[0m  ${s}`;
const bad = (s: string) => `  \x1b[31mFAIL\x1b[0m  ${s}`;
const warn = (s: string) => `  \x1b[33mWARN\x1b[0m  ${s}`;

async function main() {
  const missingEnv = [
    ["NEXT_PUBLIC_SUPABASE_URL", URL],
    ["SUPABASE_SERVICE_ROLE_KEY", SERVICE],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missingEnv.length) {
    console.error(`Missing env: ${missingEnv.join(", ")}. Run with: npx tsx --env-file=.env.local scripts/check-db.ts`);
    process.exit(1);
  }

  const s = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
  let failures = 0;

  // ---------- 1. Schema ----------
  console.log("\nTables and columns");
  const present: string[] = [];
  for (const [table, cols] of Object.entries(TABLES)) {
    const { error } = await s.from(table).select(cols.join(",")).limit(1);
    if (!error) {
      console.log(ok(`${table} (${cols.length} columns)`));
      present.push(table);
    } else if (/does not exist|schema cache|PGRST205/i.test(`${error.code} ${error.message}`)) {
      console.log(bad(`${table} is missing or has missing columns: ${error.message}`));
      failures++;
    } else {
      console.log(bad(`${table}: ${error.code ?? ""} ${error.message}`));
      failures++;
    }
  }

  if (present.length !== Object.keys(TABLES).length) {
    console.log(`\nRun supabase/schema.sql in the Supabase SQL editor, then re-run this check.`);
    process.exit(1);
  }

  // ---------- 2. Realtime ----------
  console.log("\nRealtime (insert a throwaway row into each table, wait for the change event)");
  const rt = createClient(URL!, ANON!, { auth: { persistSession: false } });
  const fired = new Set<string>();
  const channel = rt.channel(`huddle-healthcheck-${Date.now()}`);
  for (const table of Object.keys(TABLES)) {
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table }, () => fired.add(table));
  }

  const subscribed = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), REALTIME_WAIT_MS);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") { clearTimeout(timer); resolve(true); }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(timer); resolve(false); }
    });
  });

  if (!subscribed) {
    console.log(bad("could not open a Realtime channel with the anon key (check the URL, the anon key, and that Realtime is on for the project)"));
    await rt.removeChannel(channel);
    process.exit(1);
  }

  const groupId = `healthcheck-${Date.now()}`;
  let tripId: string | null = null;
  try {
    const { data: trip, error } = await s.from("trips").insert({ provider: "simulator", provider_group_id: groupId, title: "healthcheck" }).select().single();
    if (error) throw error;
    tripId = trip.id;

    const { data: participant } = await s.from("participants").insert({ trip_id: tripId, address: "healthcheck", display_name: "healthcheck" }).select().single();
    const { data: message } = await s.from("messages").insert({ trip_id: tripId, participant_id: participant!.id, sender_type: "human", content: "healthcheck" }).select().single();
    await s.from("preferences").insert({ trip_id: tripId, participant_id: participant!.id, category: "other", value: "healthcheck", source_message_id: message!.id });
    const { data: decision } = await s.from("decisions").insert({ trip_id: tripId, topic: "healthcheck", status: "open" }).select().single();
    await s.from("agents").insert({ trip_id: tripId, kind: "child", role: "stays", persona_name: "Healthcheck", task: "healthcheck", decision_id: decision!.id });
    await s.from("speak_candidates").insert({ trip_id: tripId, speaker: "huddle", trigger: "intro", content: "healthcheck" });

    const deadline = Date.now() + REALTIME_WAIT_MS;
    while (fired.size < Object.keys(TABLES).length && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250));
    }
  } finally {
    await rt.removeChannel(channel);
    if (tripId) await s.from("trips").delete().eq("id", tripId);
  }

  for (const table of Object.keys(TABLES)) {
    if (fired.has(table)) console.log(ok(`${table} realtime`));
    else { console.log(bad(`${table} is NOT in the supabase_realtime publication`)); failures++; }
  }

  // ---------- 3. Existing data ----------
  console.log("\nExisting data");
  for (const table of ["trips", "participants", "messages", "preferences", "decisions", "agents", "speak_candidates"]) {
    const { count } = await s.from(table).select("*", { count: "exact", head: true });
    console.log(`  ${String(count ?? 0).padStart(5)}  ${table}`);
  }

  if (failures) {
    console.log(`\n${failures} check(s) failed.`);
    if (![...fired].length) {
      console.log(`If tables exist but nothing fired, run this in the SQL editor:`);
      console.log(`  alter publication supabase_realtime add table ${Object.keys(TABLES).join(", ")};`);
    }
    process.exit(1);
  }
  console.log("\nAll checks passed. Schema and Realtime are ready.\n");
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
