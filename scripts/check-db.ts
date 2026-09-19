/**
 * Huddle database health check.
 *
 * Verifies that every table in supabase/schema.sql exists with the columns the app reads,
 * and that Row Level Security is on.
 *
 * The RLS check is a real round trip: it reads each table with the anon key, the same key the
 * browser ships. With RLS on and no policies, every one of those reads must come back empty.
 * If any returns a row while the service role can see data, RLS is off and the anon key leaks.
 *
 * Run: npx tsx --env-file=.env.local scripts/check-db.ts
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Columns the app actually reads or writes, per table. */
const TABLES: Record<string, string[]> = {
  trips: ["id", "provider", "provider_group_id", "title", "status", "activity_level", "debate_mode", "last_agent_post_at", "created_at"],
  participants: ["id", "trip_id", "address", "display_name", "created_at"],
  messages: ["id", "trip_id", "participant_id", "sender_type", "persona", "content", "provider_message_id", "created_at"],
  preferences: ["id", "trip_id", "participant_id", "category", "value", "visibility", "source_message_id", "confirmed", "updated_at"],
  decisions: ["id", "trip_id", "topic", "status", "options", "chosen", "updated_at", "created_at"],
  agents: ["id", "trip_id", "kind", "role", "persona_name", "emoji", "task", "champions", "decision_id", "status", "created_at"],
  speak_candidates: ["id", "trip_id", "speaker", "trigger", "urgency", "content", "seq", "status", "reason", "created_at", "posted_at"],
  dm_events: ["id", "provider_message_id", "created_at"],
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

  // ---------- 2. Row Level Security ----------
  console.log("\nRow Level Security (read each table with the anon key, which must see nothing)");
  const anon = createClient(URL!, ANON!, { auth: { persistSession: false } });
  for (const table of Object.keys(TABLES)) {
    const { data, error } = await anon.from(table).select("id").limit(1);
    const { count } = await s.from(table).select("*", { count: "exact", head: true });
    if (error) {
      console.log(ok(`${table} blocked for anon (${error.code ?? "error"})`));
    } else if ((data ?? []).length === 0) {
      if ((count ?? 0) > 0) console.log(ok(`${table} returns nothing to anon`));
      else console.log(warn(`${table} is empty, so this proves nothing yet. Re-run once the table has rows.`));
    } else {
      console.log(bad(`${table} is READABLE with the anon key. RLS is off. Run supabase/schema.sql.`));
      failures++;
    }
  }

  // ---------- 3. Existing data ----------
  console.log("\nExisting data");
  for (const table of ["trips", "participants", "messages", "preferences", "decisions", "agents", "speak_candidates"]) {
    const { count } = await s.from(table).select("*", { count: "exact", head: true });
    console.log(`  ${String(count ?? 0).padStart(5)}  ${table}`);
  }

  if (failures) {
    console.log(`\n${failures} check(s) failed. Run supabase/schema.sql in the Supabase SQL editor, then re-run this check.`);
    process.exit(1);
  }
  console.log("\nAll checks passed. Schema is ready and the anon key is locked out.\n");
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
