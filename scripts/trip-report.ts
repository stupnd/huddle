import { createClient } from "@supabase/supabase-js";
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
async function main() {
  const gid = process.argv[2];
  const { data: trip } = await s.from("trips").select("*").eq("provider_group_id", gid).single();
  console.log("=== TRIP ===");
  console.log(`id=${trip!.id}\ntitle=${trip!.title}\nactivity_level=${trip!.activity_level}  debate_mode=${trip!.debate_mode}\nlast_agent_post_at=${trip!.last_agent_post_at}`);

  const { data: parts } = await s.from("participants").select("*").eq("trip_id", trip!.id).order("created_at");
  const nameOf = (id: string | null) => parts!.find(p => p.id === id)?.display_name ?? parts!.find(p => p.id === id)?.address ?? "?";

  console.log("\n=== PARTICIPANTS ===");
  for (const p of parts!) console.log(`  ${p.display_name ?? "(no name)"}  <${p.address}>`);

  const { data: prefs } = await s.from("preferences").select("*").eq("trip_id", trip!.id).order("updated_at");
  console.log(`\n=== PREFERENCES (${prefs!.length}) ===`);
  for (const p of parts!) {
    const mine = prefs!.filter(x => x.participant_id === p.id);
    console.log(`  ${p.display_name ?? p.address}:`);
    if (!mine.length) console.log("    (none)");
    for (const x of mine) console.log(`    [${x.category}] ${x.value}   {${x.visibility}${x.confirmed ? ", confirmed" : ""}}`);
  }

  const { data: decs } = await s.from("decisions").select("*").eq("trip_id", trip!.id).order("created_at");
  console.log(`\n=== DECISIONS (${decs!.length}) ===`);
  for (const d of decs!) {
    console.log(`  [${d.status}] "${d.topic}"  chosen=${d.chosen ?? "-"}`);
    for (const o of (d.options as any[])) console.log(`     - ${o.label}${o.est_cost_per_person ? ` ($${o.est_cost_per_person}/person)` : ""}${o.details ? `: ${o.details}` : ""}`);
  }

  const { data: agents } = await s.from("agents").select("*").eq("trip_id", trip!.id).order("created_at");
  console.log(`\n=== AGENTS (${agents!.length}) ===`);
  for (const a of agents!) console.log(`  ${a.emoji} ${a.persona_name} (${a.role}) status=${a.status} champions=${a.champions ?? "-"}\n     task: ${a.task}`);

  const { data: cands } = await s.from("speak_candidates").select("*").eq("trip_id", trip!.id).order("created_at").order("seq");
  console.log(`\n=== SPEAK LOG (${cands!.length}) ===`);
  for (const c of cands!) {
    const who = c.speaker === "huddle" ? "Huddle" : c.speaker === "budget" ? "Penny" : (agents!.find(a => a.id === c.speaker)?.persona_name ?? c.speaker.slice(0, 8));
    console.log(`  [${c.status}] ${who} trigger=${c.trigger} urgency=${c.urgency} seq=${c.seq} reason=${c.reason ?? "-"}`);
    console.log(`     "${c.content}"`);
  }

  const { data: msgs } = await s.from("messages").select("*").eq("trip_id", trip!.id).order("created_at");
  console.log(`\n=== TRANSCRIPT (${msgs!.length}) ===`);
  for (const m of msgs!) {
    const who = m.sender_type === "human" ? nameOf(m.participant_id)
      : m.persona === "huddle" ? "HUDDLE" : m.persona === "budget" ? "PENNY"
      : (agents!.find(a => a.id === m.persona)?.persona_name?.toUpperCase() ?? "AGENT");
    console.log(`  ${who}: ${m.content}`);
  }
  process.exit(0);
}
main();
