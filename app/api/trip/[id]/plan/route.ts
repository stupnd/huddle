import { NextResponse } from "next/server";
import { buildItinerary } from "@/lib/agents/planner";
import { tick } from "@/lib/agents/spokesperson";

export const maxDuration = 60;

/** Build (or rebuild) the day-by-day itinerary from what the group has settled so far. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { items, summary } = await buildItinerary(id);
  if (!items.length) {
    return NextResponse.json({ error: "Not enough decided yet to build a plan. Settle where and when first." }, { status: 409 });
  }
  await tick(id, { force: true });
  return NextResponse.json({ ok: true, items: items.length, summary });
}
