import { createClient } from "@supabase/supabase-js";
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function main() {
  const gid = `race-test-${Date.now()}`;
  const { data: trip } = await s.from("trips").insert({ provider: "simulator", provider_group_id: gid, title: "race test" }).select().single();
  const rows = [0, 1, 2].map((seq) => ({
    trip_id: trip!.id, speaker: "huddle", trigger: "debate", urgency: 2, seq, content: `race line ${seq}`,
  }));
  await s.from("speak_candidates").insert(rows);
  console.log(`trip ${trip!.id} seeded with ${rows.length} pending candidates`);

  const { tick } = await import("../lib/agents/spokesperson");
  const results = await Promise.all(Array.from({ length: 8 }, () => tick(trip!.id, { force: true })));
  console.log("tick results:", JSON.stringify(results));

  const { data: msgs } = await s.from("messages").select("content").eq("trip_id", trip!.id);
  const counts = new Map<string, number>();
  for (const m of msgs!) counts.set(m.content, (counts.get(m.content) ?? 0) + 1);
  console.log("\nmessages actually written:");
  let dupes = 0;
  for (const [content, n] of counts) {
    console.log(`  ${n}x  "${content}"`);
    if (n > 1) dupes++;
  }
  const { data: cands } = await s.from("speak_candidates").select("status").eq("trip_id", trip!.id);
  console.log("candidate statuses:", cands!.map((c) => c.status).join(", "));

  await s.from("trips").delete().eq("id", trip!.id);
  console.log(dupes === 0 && msgs!.length === 3 ? "\nPASS: every candidate sent exactly once" : `\nFAIL: ${msgs!.length} messages for 3 candidates`);
  process.exit(dupes === 0 && msgs!.length === 3 ? 0 : 1);
}
main();
