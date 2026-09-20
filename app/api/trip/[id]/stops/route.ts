import { NextResponse } from "next/server";
import { requireMember } from "@/lib/auth/session";
import { db, type ItineraryItem } from "@/lib/supabase";
import { fillTravelTimes } from "@/lib/agents/planner";

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
  const { stopId, status, reason, by, start_time, duration_min, move } = await req.json();
  if (!stopId) return NextResponse.json({ error: "stopId is required" }, { status: 400 });

  // Timeline edits: a new start time, a new duration, or a nudge up/down within the day.
  if (start_time !== undefined || duration_min !== undefined || move) {
    return editTimeline(id, stopId, { start_time, duration_min, move });
  }
  if (!STATUSES.includes(status)) return NextResponse.json({ error: `status must be one of ${STATUSES.join(", ")}` }, { status: 400 });

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

const TIME = /^(?:[01]?\d|2[0-3]):[0-5]\d$|^\d{1,2}(?::\d{2})?\s?(?:am|pm)$/i;

async function editTimeline(tripId: string, stopId: string, edit: { start_time?: unknown; duration_min?: unknown; move?: unknown }) {
  const s = db();
  const { data: stop } = await s.from("itinerary_items").select("*").eq("id", stopId).eq("trip_id", tripId).maybeSingle();
  if (!stop) return NextResponse.json({ error: "stop not found" }, { status: 404 });

  const patch: Partial<ItineraryItem> = {};
  if (edit.start_time !== undefined) {
    const t = String(edit.start_time ?? "").trim().toLowerCase();
    if (t && !TIME.test(t)) return NextResponse.json({ error: "time should look like 1:30pm or 13:30" }, { status: 400 });
    patch.start_time = t || null;
  }
  if (edit.duration_min !== undefined) {
    const d = Number(edit.duration_min);
    if (!Number.isFinite(d) || d < 0 || d > 24 * 60) return NextResponse.json({ error: "duration should be minutes, 0 to 1440" }, { status: 400 });
    patch.duration_min = Math.round(d);
  }
  if (Object.keys(patch).length) {
    const { error } = await s.from("itinerary_items").update(patch).eq("id", stopId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (edit.move === "up" || edit.move === "down") {
    // Swap sort with the neighbour on the same day, then recompute that day's travel times
    const { data: day } = await s.from("itinerary_items").select("*").eq("trip_id", tripId).eq("day_index", stop.day_index).order("sort");
    const rows = (day ?? []) as ItineraryItem[];
    const i = rows.findIndex((r) => r.id === stopId);
    const j = edit.move === "up" ? i - 1 : i + 1;
    if (i >= 0 && j >= 0 && j < rows.length) {
      [rows[i], rows[j]] = [rows[j], rows[i]];
      rows.forEach((r, k) => (r.sort = k));
      await fillTravelTimes(rows);
      await Promise.all(rows.map((r) => s.from("itinerary_items").update({ sort: r.sort, travel_from_prev_min: r.travel_from_prev_min }).eq("id", r.id)));
    }
  }
  return NextResponse.json({ ok: true });
}
