import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listTrips } from "@/lib/trip/list";
import { plural, timeAgo } from "@/lib/format";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

export const dynamic = "force-dynamic";

export default async function Home() {
  const trips = await listTrips();
  const now = Date.now();

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-(--container-reading) flex-col gap-6 px-2 py-8 md:px-4 md:py-12">
      <ThemeToggle className="absolute top-2 right-2" />
      <div className="flex flex-col gap-2">
        <h1 className="text-balance font-display text-display-xl text-ink md:text-display-2xl">Your group chat stays a group chat.</h1>
        <p className="max-w-[36em] text-body-lg text-ink-2">
          Huddle reads the planning chat, keeps track of what everyone wants, brings in agents when the group is stuck, and shows
          you where the plan stands.
        </p>
      </div>

      <section className="flex flex-col gap-2" aria-labelledby="trips">
        <h2 id="trips" className="font-display text-display-sm text-ink-2">
          your trips
        </h2>
        {trips.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface-1 p-3 text-body text-ink-2">
            nothing here yet. start a chat with huddle in imessage, or open the simulator to fake one.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {trips.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/trip/${t.id}/plan`}
                  className="group flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-1 px-2 py-2 transition-colors duration-(--duration-fast) hover:border-line-strong hover:bg-surface-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-display text-display-sm text-ink">{t.title ?? "untitled trip"}</span>
                    <span className="block text-body-sm text-ink-3 figures">
                      {plural(t.memberCount, "person", "people")} · {plural(t.stopCount, "stop")} · {t.provider}
                      {t.lastAgentPostAt && ` · agents last spoke ${timeAgo(t.lastAgentPostAt, now)}`}
                    </span>
                  </span>
                  <ArrowRight className="size-2 shrink-0 text-ink-3 transition-transform duration-(--duration-fast) group-hover:translate-x-0.5 group-hover:text-accent" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-1">
        <Button asChild variant="secondary" size="md">
          <Link href="/sim">open the chat simulator</Link>
        </Button>
      </div>
      <p className="text-body-sm text-ink-3">made by girls who just wanna have fun</p>
    </main>
  );
}
