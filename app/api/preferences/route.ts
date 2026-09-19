import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireMember } from "@/lib/auth/session";

/** Participants confirm or remove what Huddle captured about them. */
export async function PATCH(req: Request) {
  const { id, action, value } = await req.json();
  const s = db();
  const { data: row } = await s.from("preferences").select("trip_id").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const auth = await requireMember(row.trip_id);
  if (auth instanceof Response) return auth;
  if (action === "confirm") await s.from("preferences").update({ confirmed: true }).eq("id", id);
  else if (action === "edit") await s.from("preferences").update({ value, confirmed: true, updated_at: new Date().toISOString() }).eq("id", id);
  else if (action === "delete") await s.from("preferences").delete().eq("id", id);
  else return NextResponse.json({ error: "unknown action" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
