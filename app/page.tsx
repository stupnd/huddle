import { WaitlistForm } from "@/components/landing/WaitlistForm";
import { Hero } from "@/components/landing/Hero";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** The front door. Reads no trip data; that lives behind sign-in at /trips. Deliberately dark. */
export default async function Landing() {
  const session = await getSession();
  return (
    <div className="bg-[#0b0c18] text-[#ffffff]">
      <Hero signedIn={Boolean(session)} />

      <main className="mx-auto max-w-[1100px] px-5 pb-24 md:px-10">
        <section id="how" className="grid gap-10 py-20 md:grid-cols-3 md:gap-8" aria-label="How it works">
          <div className="md:col-span-3">
            <p className="mb-2 text-[12px] uppercase tracking-[0.14em] text-[rgba(255,255,255,0.40)]">how it works</p>
            <h2 className="max-w-[18em] text-balance font-display text-[clamp(1.8rem,3.5vw,2.6rem)] font-bold leading-tight tracking-tight">Nothing to install. Nothing to learn. It's just in the chat.</h2>
          </div>
          {[
            ["text like normal", "huddle reads the chat and keeps track of who wants what, without saying anything."],
            ["@ it when you want help", "a stays, food, or getting-around specialist looks up real places and prices and answers in a couple of lines."],
            ["the plan lives in the app", "a day-by-day itinerary with photos, links, a map, and what it costs each of you. edit it there, or say \"@huddle plan\"."],
          ].map(([h, b]) => (
            <div key={h} className="rounded-[20px] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] p-6">
              <h3 className="font-display text-[20px] font-bold tracking-tight">{h}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-[rgba(255,255,255,0.60)]">{b}</p>
            </div>
          ))}
        </section>

        <section id="agents" className="border-t border-[rgba(255,255,255,0.10)] py-20" aria-label="The agents">
          <p className="mb-2 text-[12px] uppercase tracking-[0.14em] text-[rgba(255,255,255,0.40)]">the agents</p>
          <h2 className="max-w-[20em] text-balance font-display text-[clamp(1.8rem,3.5vw,2.6rem)] font-bold leading-tight tracking-tight">Each one knows something the others don't.</h2>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["🧭", "Huddle", "the host. speaks when tagged, brings in the others, keeps the plan honest."],
              ["💸", "Penny", "sees every budget, does the math in code, never says whose number is whose."],
              ["🏨", "Stays", "real hotels and hostels with ratings, prices, and the walk to the pier."],
              ["🍜", "Food", "real restaurants, price level, and whether they're open right now."],
              ["🚆", "Getting around", "real drive, transit, and walk times between the stops in the plan."],
              ["🎟️", "Things to do", "the plan itself: times, durations, photos, and what each stop costs."],
            ].map(([e, n, d]) => (
              <li key={n} className="flex gap-3 rounded-[20px] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] p-5">
                <span className="text-[26px] leading-none">{e}</span>
                <div><p className="font-display text-[17px] font-bold">{n}</p><p className="mt-1 text-[14px] leading-relaxed text-[rgba(255,255,255,0.60)]">{d}</p></div>
              </li>
            ))}
          </ul>
        </section>

        <section id="join" className="border-t border-[rgba(255,255,255,0.10)] py-20" aria-label="Join">
          <div className="rounded-[28px] border border-[rgba(255,255,255,0.10)] bg-gradient-to-b from-[rgba(255,255,255,0.06)] to-[rgba(255,255,255,0.02)] p-8 md:p-12">
            <h2 className="max-w-[16em] text-balance font-display text-[clamp(1.8rem,3.5vw,2.6rem)] font-bold leading-tight tracking-tight">We're letting groups in a few at a time.</h2>
            <p className="mt-3 max-w-[36em] text-[16px] text-[rgba(255,255,255,0.60)]">iMessage only for now. Leave your email and we'll text you when your group can start.</p>
            <div className="mt-6 max-w-[30em] [&_input]:border-[rgba(255,255,255,0.15)] [&_input]:bg-[rgba(255,255,255,0.06)] [&_input]:text-[#ffffff] [&_input]:placeholder:text-[rgba(255,255,255,0.40)]"><WaitlistForm source="footer" /></div>
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(255,255,255,0.10)] pt-8 text-[13px] text-[rgba(255,255,255,0.40)]">
          <span>made by girls who just wanna have fun</span>
          <a href="/sim" className="hover:text-[rgba(255,255,255,0.70)]">try the simulator</a>
        </footer>
      </main>
    </div>
  );
}
