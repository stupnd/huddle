import { db, type Job } from "./supabase";

/**
 * A tiny job queue on a table. The worker drains it; the API only enqueues. This exists because
 * the planner takes 30 to 60 seconds and Vercel functions stop at 60, which showed up as 504s.
 */

/** Enqueue a plan build unless one is already queued or running for this trip. */
export async function enqueuePlan(tripId: string, kind: Job["kind"] = "plan", announce = false): Promise<Job | null> {
  const s = db();
  const { data: open } = await s.from("jobs").select("id,kind,status").eq("trip_id", tripId).in("status", ["queued", "running"]).limit(1);
  if (open?.length) return null;
  const { data } = await s.from("jobs").insert({ trip_id: tripId, kind, announce }).select().single();
  return (data as Job) ?? null;
}

/** The latest job for a trip, for the dashboard to show "building…" or an error. */
export async function latestJob(tripId: string): Promise<Job | null> {
  const { data } = await db().from("jobs").select("*").eq("trip_id", tripId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as Job) ?? null;
}

/** Claim the oldest queued job atomically. Two workers cannot both take it. */
export async function claimNextJob(): Promise<Job | null> {
  const s = db();
  const { data: next } = await s.from("jobs").select("id").eq("status", "queued").order("created_at").limit(1).maybeSingle();
  if (!next) return null;
  const { data } = await s.from("jobs").update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", next.id).eq("status", "queued").select().maybeSingle();
  return (data as Job) ?? null;
}

export async function finishJob(id: string, error?: string) {
  await db().from("jobs").update({ status: error ? "failed" : "done", error: error ?? null, finished_at: new Date().toISOString() }).eq("id", id);
}

/** Jobs stuck in "running" (worker died mid-plan) go back to the queue after 5 minutes. */
export async function reclaimStuckJobs() {
  await db().from("jobs").update({ status: "queued", started_at: null }).eq("status", "running")
    .lt("started_at", new Date(Date.now() - 5 * 60_000).toISOString());
}
