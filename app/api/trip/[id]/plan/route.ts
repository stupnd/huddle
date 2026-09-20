import { NextResponse } from "next/server";
import { requireMember } from "@/lib/auth/session";
import { enqueuePlan } from "@/lib/jobs";

/** Ask the worker to build the plan. Returns at once; the dashboard shows progress from the job row. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireMember(id);
  if (auth instanceof Response) return auth;
  const job = await enqueuePlan(id, "plan", true);
  return NextResponse.json({ ok: true, queued: Boolean(job), alreadyRunning: !job }, { status: 202 });
}
