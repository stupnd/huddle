import { NextResponse } from "next/server";
import { readTrip } from "@/lib/trip/read";

export const dynamic = "force-dynamic";

/**
 * Everything the dashboard and the simulator need, in one read. The browser never talks
 * to Supabase directly; this route (and the trip layout, which shares readTrip) is the
 * only way trip data reaches the page.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await readTrip(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
