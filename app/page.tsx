import Link from "next/link";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { WaitlistForm } from "@/components/landing/WaitlistForm";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** The front door. Nothing here reads trip data; that lives behind sign-in at /trips. */
export default async function Landing() {
  const session = await getSession();
  return (
    <main className="mx-auto flex min-h-dvh max-w-(--container-reading) flex-col px-2 md:px-4">
      <header className="flex items-center justify-between py-3">
        <span className="font-display text-display-sm text-ink">huddle</span>
        <nav className="flex items-center gap-2 text-body-sm">
          <Link href={session ? "/trips" : "/signin"} className="text-ink-2 underline-offset-2 hover:underline">{session ? "your trips" : "sign in"}</Link>
          <ThemeToggle />
        </nav>
      </header>

      <section className="flex flex-col gap-4 py-8 md:py-12">
        <h1 className="max-w-[14em] text-balance font-display text-display-xl text-ink md:text-display-2xl">
          Your group chat stays a group chat.
        </h1>
        <p className="max-w-[34em] text-body-lg text-ink-2">
          Add huddle to the trip chat. It remembers what everyone wants, brings in a specialist when you ask, and keeps the plan where you can all see it. It stays quiet the rest of the time.
        </p>
        <div className="max-w-[30em]"><WaitlistForm source="hero" /></div>
      </section>

      <section aria-label="What it looks like" className="py-6">
        <div className="mx-auto max-w-[24em] rounded-2xl border border-line bg-surface-1 p-2">
          <p className="mb-2 text-center text-micro text-ink-3">LA trip · 3 people + huddle</p>
          <ol className="flex flex-col gap-1 text-body-sm">
            <li className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-accent px-2 py-1 text-ink-inverse">ok LA sept 19 to 21, we land at 1pm</li>
            <li className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-accent px-2 py-1 text-ink-inverse">@huddle bring in someone for dinner on abbot kinney</li>
            <li className="max-w-[90%] self-start rounded-2xl rounded-bl-sm bg-surface-2 px-2 py-1 text-ink">
              <span className="block text-micro text-ink-3">🍜 Juno (food)</span>
              gjelina, $$$, 4.3★, wood-fired and loud<br />the butcher's daughter, $$, 4.4★, easier on the wallet<br />both a 6 min walk from the pier
            </li>
            <li className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-accent px-2 py-1 text-ink-inverse">@penny does gjelina fit</li>
            <li className="max-w-[90%] self-start rounded-2xl rounded-bl-sm bg-surface-2 px-2 py-1 text-ink">
              <span className="block text-micro text-ink-3">💸 Penny</span>
              yep, you're at $398 each with it in<br />sunday dinner is the bigger line
            </li>
          </ol>
        </div>
        <p className="mt-2 text-center text-micro text-ink-3">real replies from a real trip. names changed.</p>
      </section>

      <section className="grid gap-4 py-8 md:grid-cols-3" aria-label="How it works">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-display-sm text-ink">text like normal</h2>
          <p className="text-body text-ink-2">huddle reads the chat and keeps track of who wants what, without saying anything.</p>
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-display-sm text-ink">@ it when you want help</h2>
          <p className="text-body text-ink-2">a stays, food, or getting-around specialist looks up real places and prices and answers in a couple of lines.</p>
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-display-sm text-ink">the plan lives in the app</h2>
          <p className="text-body text-ink-2">a day-by-day itinerary with photos, links, a map, and what it costs each of you. edit it there, or say "@huddle plan".</p>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-1 p-3 md:p-4" aria-label="Join">
        <h2 className="font-display text-display-md text-ink">we're letting groups in a few at a time</h2>
        <p className="max-w-[36em] text-body text-ink-2">iMessage only for now. leave your email and we'll text you when your group can start.</p>
        <div className="max-w-[30em]"><WaitlistForm source="footer" /></div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 py-6 text-body-sm text-ink-3">
        <span>made by girls who just wanna have fun</span>
        <Link href="/sim" className="underline-offset-2 hover:underline">try the simulator</Link>
      </footer>
    </main>
  );
}
