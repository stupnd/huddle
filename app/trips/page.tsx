import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { listTripsFor } from "@/lib/trip/list";
import { plural, timeAgo } from "@/lib/format";
import { maskPhone } from "@/lib/phone";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { SignOutButton } from "@/components/auth/SignOutButton";

export const dynamic = "force-dynamic";

/** The trips you're part of. Only reachable signed in; identity is the phone you text from. */
export default async function MyTrips() {
  const session = await getSession();
  if (!session) redirect("/signin?next=/trips");
  const trips = await listTripsFor(session.phone);
  const now = Date.now();

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-(--container-reading) flex-col gap-6 px-2 py-8 md:px-4 md:py-12">
      <ThemeToggle className="absolute top-2 right-2" />
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-display-xl text-ink">your trips</h1>
        <p className="text-body text-ink-3 figures">signed in as {maskPhone(session.phone)} · <SignOutButton /></p>
      </div>

      {trips.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface-1 p-3 text-body text-ink-2">
          nothing yet. when a friend starts a trip with your number, or you text huddle to start one, it shows up here.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {trips.map((t) => (
            <li key={t.id}>
              <Link href={`/trip/${t.id}/plan`}
                className="group flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-1 px-2 py-2 transition-colors duration-(--duration-fast) hover:border-line-strong hover:bg-surface-2">
                <span className="min-w-0">
                  <span className="block truncate font-display text-display-sm text-ink">{t.title ?? "untitled trip"}</span>
                  <span className="block text-body-sm text-ink-3 figures">
                    {plural(t.memberCount, "person", "people")} · {plural(t.stopCount, "stop")}
                    {t.lastAgentPostAt && ` · agents last spoke ${timeAgo(t.lastAgentPostAt, now)}`}
                  </span>
                </span>
                <ArrowRight className="size-2 shrink-0 text-ink-3 transition-transform duration-(--duration-fast) group-hover:translate-x-0.5 group-hover:text-accent" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-body-sm text-ink-3">made by girls who just wanna have fun</p>
    </main>
  );
}
