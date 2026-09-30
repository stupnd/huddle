import { NextResponse } from "next/server";
import { readTrip } from "@/lib/trip/read";
import { requireMember } from "@/lib/auth/session";
import { simulatorEnabled } from "@/lib/messaging/simulator";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Everything the dashboard and the simulator need, in one read. The browser never talks
 * to Supabase directly; this route (and the trip layout, which shares readTrip) is the
 * only way trip data reaches the page.
 *
 * Members only: the payload carries every participant's phone number and the chat log.
 * The one exception is a simulator trip in local dev, where the /sim page plays every
 * (fake) person and nobody is signed in as them.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (simulatorEnabled() && (await isSimulatorTrip(id))) {
    const result = await readTrip(id, { phone: null, trustSimulatorTrip: true });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  }

  const auth = await requireMember(id);
  if (auth instanceof Response) return auth;
  const result = await readTrip(id, { phone: auth.phone });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}

async function isSimulatorTrip(id: string) {
  const { data } = await db().from("trips").select("provider").eq("id", id).maybeSingle();
  return data?.provider === "simulator";
}
