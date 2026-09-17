import { createClient } from "@supabase/supabase-js";
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const mask = (a: string) => a.length > 5 ? `${a.slice(0,3)}...${a.slice(-2)}` : a;
async function main() {
  const id = process.argv[2];
  const { data: t } = await s.from("trips").select("*").eq("id", id).single();
  const { data: parts } = await s.from("participants").select("*").eq("trip_id", id).order("created_at");
  const { data: ag } = await s.from("agents").select("*").eq("trip_id", id).order("created_at");
  const nameOf = (pid: string|null) => { const p = parts!.find(x => x.id === pid); return p?.display_name ?? mask(p?.address ?? "?"); };
  console.log(`TRIP ${t!.id}`);
  console.log(`title=${t!.title ?? "(none)"}  activity=${t!.activity_level}  debate_mode=${t!.debate_mode}`);
  console.log(`participants (${parts!.length}): ${parts!.map(p => `${p.display_name ?? "?"}<${mask(p.address)}>`).join(", ")}`);
  const { data: msgs } = await s.from("messages").select("*").eq("trip_id", id).order("created_at");
  console.log(`\nTRANSCRIPT (${msgs!.length}):`);
  for (const m of msgs!) {
    const who = m.sender_type === "human" ? nameOf(m.participant_id)
      : m.persona === "huddle" ? "HUDDLE" : m.persona === "budget" ? "PENNY"
      : (ag!.find(a => a.id === m.persona)?.persona_name?.toUpperCase() ?? "AGENT");
    console.log(`  ${who}: ${m.content}`);
  }
  const { data: prefs } = await s.from("preferences").select("*").eq("trip_id", id);
  console.log(`\nPREFERENCES (${prefs!.length}):`);
  for (const p of prefs!) console.log(`  ${nameOf(p.participant_id)}: [${p.category}] ${p.visibility === "private" ? "(private)" : p.value}`);
  const { data: decs } = await s.from("decisions").select("*").eq("trip_id", id);
  console.log(`\nDECISIONS:`);
  for (const d of decs!) console.log(`  [${d.status}] ${d.topic}  options: ${(d.options as any[]).map(o=>o.label).join(" / ") || "none"}`);
  console.log(`\nAGENTS (${ag!.length}):`);
  for (const a of ag!) console.log(`  ${a.emoji} ${a.persona_name} (${a.role}) status=${a.status} champions=${a.champions ?? "-"}`);
  const { data: c } = await s.from("speak_candidates").select("*").eq("trip_id", id).order("created_at").order("seq");
  console.log(`\nSPEAK QUEUE (${c!.length}):`);
  for (const x of c!) {
    const who = x.speaker === "huddle" ? "Huddle" : x.speaker === "budget" ? "Penny" : (ag!.find(a=>a.id===x.speaker)?.persona_name ?? x.speaker.slice(0,8));
    console.log(`  [${x.status}] seq=${x.seq} ${who} (${x.trigger}): ${x.content}`);
  }
  process.exit(0);
}
main();
