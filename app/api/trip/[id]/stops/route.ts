import { NextResponse } from "next/server";
import { requireMember } from "@/lib/auth/session";
import { db } from "@/lib/supabase";

const STATUSES = ["locked", "proposed", "contested", "dropped"];
const MIGRATION_HINT = "stop status needs the dashboard columns. run supabase/schema.sql in the Supabase SQL editor, then try again.";

/**
 * Change one stop's status from the dashboard. Dropping keeps the row so the
 * "removed from plan" strip can show it with its reason; locking pins it against
 * the adapter's conflict heuristics.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireMember(id);
  if (auth instanceof Response) return auth;
  const { stopId, status, reason, by } = await req.json();
  if (!stopId || !STATUSES.includes(status)) return NextResponse.json({ error: `status must be one of ${STATUSES.join(", ")}` }, { status: 400 });

  const patch =
    status === "dropped"
      ? { status, dropped_reason: String(reason ?? "removed from the dashboard").slice(0, 200), dropped_by: String(by ?? "huddle"), dropped_at: new Date().toISOString() }
      : { status, dropped_reason: null, dropped_by: null, dropped_at: null };

  const { error } = await db().from("itinerary_items").update(patch).eq("id", stopId).eq("trip_id", id);
  if (error) {
    const missing = /column|schema cache/i.test(error.message);
    return NextResponse.json({ error: missing ? MIGRATION_HINT : error.message }, { status: missing ? 409 : 500 });
  }
  return NextResponse.json({ ok: true });
}
