import { notFound } from "next/navigation";
import { Shell } from "@/components/shell/Shell";
import { adaptTrip } from "@/lib/domain/adapt";
import { readTrip } from "@/lib/trip/read";
import { TripUnavailable } from "@/components/shell/TripUnavailable";
import { getSession } from "@/lib/auth/session";
import { simulatorEnabled } from "@/lib/messaging/simulator";

export const dynamic = "force-dynamic";

/**
 * Trip dashboard shell. Every tab under /trip/[id]/* renders inside it.
 * The first snapshot is read on the server so the page paints with data;
 * the shell then polls the API and re-adapts on the client.
 */
export default async function TripLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Identity comes from the sign-in cookie, matched to a participant by phone number.
  // A guest (or a signed-in stranger) gets the public view: phone numbers masked, no viewerId,
  // a sign-in prompt, and a redirect on the first write. Only members get live updates.
  const session = await getSession();
  const sim = simulatorEnabled();
  const result = await readTrip(id, { phone: session?.phone ?? null, trustSimulatorTrip: sim });
  if (!result.ok) {
    if (result.status === 404) notFound();
    return <TripUnavailable message={result.error} />;
  }
  const me = session ? result.data.participants.find((p) => p.address === session.phone) : undefined;
  const initial = { ...adaptTrip(result.data), viewerId: me?.id ?? "" };
  // The trip API answers members, plus simulator trips in local dev
  const live = Boolean(me) || (sim && result.data.trip.provider === "simulator");
  return (
    <Shell initial={initial} tripId={id} signedIn={Boolean(session)} live={live}>
      {children}
    </Shell>
  );
}
