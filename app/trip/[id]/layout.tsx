import { notFound } from "next/navigation";
import { Shell } from "@/components/shell/Shell";
import { adaptTrip } from "@/lib/domain/adapt";
import { readTrip } from "@/lib/trip/read";
import { TripUnavailable } from "@/components/shell/TripUnavailable";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Trip dashboard shell. Every tab under /trip/[id]/* renders inside it.
 * The first snapshot is read on the server so the page paints with data;
 * the shell then polls the API and re-adapts on the client.
 */
export default async function TripLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await readTrip(id);
  if (!result.ok) {
    if (result.status === 404) notFound();
    return <TripUnavailable message={result.error} />;
  }
  // Identity comes from the sign-in cookie, matched to a participant by phone number.
  // A guest gets no viewerId, sees a sign-in prompt, and is redirected on the first write.
  const session = await getSession();
  const me = session ? result.data.participants.find((p) => p.address === session.phone) : undefined;
  const initial = { ...adaptTrip(result.data), viewerId: me?.id ?? "" };
  return (
    <Shell initial={initial} tripId={id} signedIn={Boolean(session)}>
      {children}
    </Shell>
  );
}
