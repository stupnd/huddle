import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/supabase";
import { toE164 } from "@/lib/phone";
import { setSessionCookie } from "@/lib/auth/session";

/** Check a code and start a session. Five wrong guesses burns the code. */
export async function POST(req: Request) {
  const { phone: raw, code } = await req.json().catch(() => ({}));
  const phone = typeof raw === "string" ? toE164(raw) : null;
  const digits = String(code ?? "").replace(/\D/g, "");
  if (!phone || digits.length !== 6) return NextResponse.json({ error: "Enter the 6-digit code from the text." }, { status: 400 });

  const s = db();
  const { data: row } = await s.from("login_codes").select("*").eq("phone", phone).is("used_at", null)
    .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!row || row.attempts >= 5) return NextResponse.json({ error: "That code has expired. Ask for a new one." }, { status: 400 });

  const hash = createHash("sha256").update(`${phone}:${digits}`).digest("hex");
  if (hash !== row.code_hash) {
    await s.from("login_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    return NextResponse.json({ error: "That's not the code. Check the text and try again." }, { status: 400 });
  }

  await s.from("login_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);
  await setSessionCookie(phone);
  return NextResponse.json({ ok: true });
}
