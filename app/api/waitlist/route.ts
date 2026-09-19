import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { toE164 } from "@/lib/phone";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Join the waitlist. Re-submitting the same email is a quiet success, not an error. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim().slice(0, 60) || null;
  const phone = body.phone ? toE164(String(body.phone)) : null;
  if (!EMAIL.test(email)) return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });

  const { error } = await db().from("waitlist").upsert(
    { email, name, phone, source: String(body.source ?? "landing").slice(0, 30) },
    { onConflict: "email", ignoreDuplicates: true }
  );
  if (error) return NextResponse.json({ error: "Couldn't save that. Try again in a moment." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
