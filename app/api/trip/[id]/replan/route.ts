import { NextResponse } from "next/server";
import { requireMember } from "@/lib/auth/session";
import { enqueuePlan } from "@/lib/jobs";

/** Specialists refresh their options, then the plan is rebuilt. All of it runs in the worker. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireMember(id);
  if (auth instanceof Response) return auth;
  const job = await enqueuePlan(id, "replan", true);
  return NextResponse.json({ ok: true, queued: Boolean(job), alreadyRunning: !job }, { status: 202 });
}
