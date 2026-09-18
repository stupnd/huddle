import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

/** Rename a person from the dashboard. Names also arrive from the chat, so this is the manual override. */
export async function PATCH(req: Request) {
  const { id, display_name } = await req.json();
  const name = String(display_name ?? "").trim().slice(0, 40);
  if (!id || !name) return NextResponse.json({ error: "id and display_name are required" }, { status: 400 });
  const { error } = await db().from("participants").update({ display_name: name }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
