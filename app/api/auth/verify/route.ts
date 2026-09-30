import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/supabase";
import { toE164 } from "@/lib/phone";
import { setSessionCookie } from "@/lib/auth/session";

const MAX_ATTEMPTS = 5;

/**
 * Check a code and start a session. Five guesses burns the code.
 *
 * Every guess claims one attempt with a conditional update (attempts = n+1 where attempts = n and
 * n < 5) before the hash is compared. Two requests that read the same n cannot both win, so firing
 * guesses in parallel cannot squeeze more than five past the limit the way read-then-write could.
 */
export async function POST(req: Request) {
  const { phone: raw, code } = await req.json().catch(() => ({}));
  const phone = typeof raw === "string" ? toE164(raw) : null;
  const digits = String(code ?? "").replace(/\D/g, "");
  if (!phone || digits.length !== 6) return NextResponse.json({ error: "Enter the 6-digit code from the text." }, { status: 400 });

  const s = db();
  const expired = NextResponse.json({ error: "That code has expired. Ask for a new one." }, { status: 400 });
  const { data: row } = await s.from("login_codes").select("*").eq("phone", phone).is("used_at", null)
    .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!row || row.attempts >= MAX_ATTEMPTS) return expired;

  // Claim this attempt atomically. Zero rows back means another guess got there first (or the
  // code was just used or burned), so this one does not get to compare at all.
  const { data: claimed } = await s.from("login_codes").update({ attempts: row.attempts + 1 })
    .eq("id", row.id).eq("attempts", row.attempts).lt("attempts", MAX_ATTEMPTS).is("used_at", null).select("id");
  if (!claimed?.length) return NextResponse.json({ error: "Too many tries at once. Wait a moment and try again." }, { status: 429 });

  const hash = createHash("sha256").update(`${phone}:${digits}`).digest("hex");
  if (hash !== row.code_hash) {
    return NextResponse.json({ error: "That's not the code. Check the text and try again." }, { status: 400 });
  }

  // Burn the code first, conditionally, so a right code sent twice in parallel signs in once
  const { data: burned } = await s.from("login_codes").update({ used_at: new Date().toISOString() })
    .eq("id", row.id).is("used_at", null).select("id");
  if (!burned?.length) return expired;
  try {
    await setSessionCookie(phone);
  } catch (err) {
    // Signing failed (e.g. SESSION_SECRET missing): give the code back for a retry rather than
    // letting a server error consume it
    await s.from("login_codes").update({ used_at: null }).eq("id", row.id);
    throw err;
  }

  // Ask for a name once, if no trip has one for this number yet
  const { data: named } = await s.from("participants").select("id").eq("address", phone).not("display_name", "is", null).limit(1);
  return NextResponse.json({ ok: true, needsName: !named?.length });
}
