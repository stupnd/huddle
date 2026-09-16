import { createClient } from "@supabase/supabase-js";
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
async function main() {
  const { data: trip } = await s.from("trips").select("id").eq("provider_group_id", process.argv[2]).single();
  const { data: p } = await s.from("participants").select("id").eq("trip_id", trip!.id).limit(1).single();
  // Exactly what listener.ts does when the model returns "preference" instead of "value"
  const { data, error } = await s.from("preferences").insert({
    trip_id: trip!.id, participant_id: p!.id, category: "transport", value: undefined, visibility: "group",
  }).select();
  console.log("data:", data);
  console.log("error:", error ? `${error.code} ${error.message}` : "none");
  process.exit(0);
}
main();
