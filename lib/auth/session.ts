import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "../supabase";

/**
 * Sessions are a signed cookie, not a database row. The payload is the phone number and an
 * expiry; the signature is an HMAC with SESSION_SECRET. Identity in Huddle is a phone number,
 * so that is all a session needs to carry. 30 days, HttpOnly, SameSite=Lax.
 */

const COOKIE = "huddle_session";
const DAYS = 30;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 random characters");
  return s;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function makeToken(phone: string) {
  const exp = Date.now() + DAYS * 86_400_000;
  const payload = Buffer.from(JSON.stringify({ p: phone, e: exp })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readToken(token: string | undefined): { phone: string } | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { p, e } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof p !== "string" || typeof e !== "number" || Date.now() > e) return null;
    return { phone: p };
  } catch {
    return null;
  }
}

export async function setSessionCookie(phone: string) {
  const jar = await cookies();
  jar.set(COOKIE, makeToken(phone), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: DAYS * 86_400,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** The signed-in phone number, or null. Safe to call from server components and route handlers. */
export async function getSession(): Promise<{ phone: string } | null> {
  const jar = await cookies();
  return readToken(jar.get(COOKIE)?.value);
}

/** True when the signed-in person is a participant of this trip. This is what gates every write. */
export async function isMember(tripId: string, phone: string) {
  const { data } = await db().from("participants").select("id").eq("trip_id", tripId).eq("address", phone).maybeSingle();
  return Boolean(data);
}

/**
 * For route handlers: returns the session or a ready-made 401/403 response.
 * Usage: const auth = await requireMember(tripId); if (auth instanceof Response) return auth;
 */
export async function requireMember(tripId: string): Promise<{ phone: string } | Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in to change this trip." }, { status: 401 });
  if (!(await isMember(tripId, session.phone))) return Response.json({ error: "Only people in this trip can change it." }, { status: 403 });
  return session;
}
