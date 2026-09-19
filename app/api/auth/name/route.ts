import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";

/**
 * The name step of sign-in. One phone number can be in several trips; this names every
 * participant row for that number that doesn't have a name yet, so decisions and votes read
 * as "Krisha" everywhere instead of the last four digits.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { name: raw } = await req.json().catch(() => ({}));
  const name = String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (name.length < 1) return NextResponse.json({ error: "Enter your name." }, { status: 400 });

  const { error } = await db().from("participants").update({ display_name: name }).eq("address", session.phone).is("display_name", null);
  if (error) return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true, name });
}
