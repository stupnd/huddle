import { NextResponse } from "next/server";
import { createHash, randomInt } from "node:crypto";
import { db } from "@/lib/supabase";
import { toE164, maskPhone } from "@/lib/phone";
import { claw } from "@/lib/messaging/claw";

export const maxDuration = 30;

/**
 * Text a 6-digit sign-in code from Huddle's own iMessage line.
 *
 * Only numbers Huddle already knows get a code: if the number is not a participant of some
 * trip, there is nothing to sign in to, and refusing is also what stops this endpoint being
 * used to text arbitrary people. The response is identical either way so it cannot be used
 * to check whether a number is in the system.
 */
export async function POST(req: Request) {
  const { phone: raw } = await req.json().catch(() => ({}));
  const phone = typeof raw === "string" ? toE164(raw) : null;
  if (!phone) return NextResponse.json({ error: "That doesn't look like a phone number." }, { status: 400 });

  const s = db();
  const ok = NextResponse.json({ ok: true, to: maskPhone(phone) });

  const { data: known } = await s.from("participants").select("id").eq("address", phone).limit(1);
  if (!known?.length) return ok;

  // At most 3 codes per number per 10 minutes
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await s.from("login_codes").select("*", { count: "exact", head: true }).eq("phone", phone).gte("created_at", since);
  if ((count ?? 0) >= 3) return ok;

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const code_hash = createHash("sha256").update(`${phone}:${code}`).digest("hex");
  await s.from("login_codes").insert({ phone, code_hash, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });

  const r = await claw.send({ to: phone, text: `your huddle sign-in code is ${code.slice(0, 3)} ${code.slice(3)}. it expires in 10 minutes.` });
  if (!r.ok) console.error("[auth] could not text code", r.error ?? r.errorCode);
  return ok;
}
