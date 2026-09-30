"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import s from "./Hero.module.css";

/** A sparse starfield on a canvas. Cheaper than hundreds of divs and it can drift very slowly. */
function Stars() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    let raf = 0; let t = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stars = Array.from({ length: 110 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.1 + 0.3, p: Math.random() * Math.PI * 2 }));
    const draw = () => {
      const { width: w, height: h } = c.getBoundingClientRect();
      if (c.width !== w * devicePixelRatio || c.height !== h * devicePixelRatio) { c.width = w * devicePixelRatio; c.height = h * devicePixelRatio; }
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (const st of stars) {
        const tw = reduce ? 1 : 0.65 + 0.35 * Math.sin(t / 900 + st.p);
        ctx.globalAlpha = tw * (st.y < 0.6 ? 0.9 : 0.35);
        ctx.fillStyle = "#dfe8ff";
        ctx.beginPath(); ctx.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduce) { t += 16; raf = requestAnimationFrame(draw); }
    };
    draw();
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, []);
  return <canvas ref={ref} className={s.stars} aria-hidden />;
}

/** The one call to action. A white pill that turns into the email field when pressed. */
function JoinPill() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setState("busy"); setMsg(null);
    try {
      const r = await fetch("/api/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, source: "hero" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "couldn't save that");
      setState("done");
    } catch (err) { setState("error"); setMsg(err instanceof Error ? err.message : "couldn't save that"); }
  };
  if (state === "done") return <p className="rounded-full border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.08)] px-4 py-2.5 text-[15px] text-[rgba(255,255,255,0.85)]">you're on the list. we'll text before we email.</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="rounded-full bg-[#ffffff] px-6 py-3 text-[15px] font-medium text-[#0b0c18] shadow-[0_10px_40px_-10px_rgba(255,255,255,.5)] transition-transform hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ffffff]">
        join the waitlist
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="flex w-full max-w-[26rem] items-center gap-1 rounded-full bg-[#ffffff] p-1 pl-4 shadow-[0_10px_40px_-10px_rgba(255,255,255,.5)]">
      <label htmlFor="hero-email" className="sr-only">email</label>
      <input id="hero-email" type="email" required autoFocus autoComplete="email" placeholder="you@school.edu" value={email} onChange={(e) => setEmail(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-[15px] text-[#0b0c18] outline-none placeholder:text-[#0b0c18]/40" />
      <button type="submit" disabled={state === "busy"} className="rounded-full bg-[#0b0c18] px-4 py-2 text-[14px] font-medium text-[#ffffff] disabled:opacity-60">
        {state === "busy" ? "…" : "join"}
      </button>
      {msg && <p role="alert" className="sr-only">{msg}</p>}
    </form>
  );
}

export function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <div className={`${s.backdrop} min-h-dvh px-2 pt-2 pb-4 md:px-4 md:pt-4`}>
      <section className={`${s.card} relative mx-auto min-h-[calc(100dvh-2rem)] max-w-[1400px] overflow-hidden rounded-[28px] text-[#ffffff]`}>
        <Stars />

        <header className="relative z-10 flex items-center justify-between px-5 py-5 md:px-10 md:py-7">
          <Link href="/" className="font-display text-[22px] font-bold tracking-tight">huddle</Link>
          <nav className="hidden items-center gap-8 text-[15px] text-[rgba(255,255,255,0.80)] md:flex" aria-label="primary">
            <a href="#how" className="hover:text-[#ffffff]">how it works</a>
            <a href="#agents" className="hover:text-[#ffffff]">the agents</a>
            <a href="#join" className="hover:text-[#ffffff]">waitlist</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href={signedIn ? "/trips" : "/signin"} className="rounded-full border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.05)] px-4 py-2 text-[14px] text-[rgba(255,255,255,0.90)] hover:bg-[rgba(255,255,255,0.10)]">
              {signedIn ? "your trips" : "sign in"}
            </Link>
            <a href="#join" className="hidden rounded-full bg-[#ffffff] px-4 py-2 text-[14px] font-medium text-[#0b0c18] md:inline-block">join</a>
          </div>
        </header>

        <div className="relative z-10 mx-auto flex max-w-[64rem] flex-col items-center px-5 pt-10 text-center md:pt-16">
          <h1 className="text-balance font-display text-[clamp(2.5rem,6.6vw,5rem)] font-extrabold leading-[0.98] tracking-[-0.035em]">
            Your group chat<br />stays a group chat.
          </h1>
          <p className="mt-6 max-w-[34em] text-[17px] leading-relaxed text-[rgba(255,255,255,0.60)] md:text-[19px]">
            Huddle sits in the trip chat, remembers what everyone wants, and brings in a specialist when you ask. The plan lives where you can all see it.
          </p>
          <div className="mt-8 flex w-full justify-center"><JoinPill /></div>
        </div>

        {/* the orb */}
        <div className={s.orbWrap} aria-hidden>
          <div className={s.orb}>
            <span className={`${s.blob} ${s.blobA}`} />
            <span className={`${s.blob} ${s.blobB}`} />
            <span className={`${s.blob} ${s.blobC}`} />
            <span className={s.gloss} />
            <span className={s.rim} />
          </div>
        </div>

        {/* floating moments from a real trip */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[52%] z-10 hidden md:block" aria-label="what it looks like in the chat">
          <div className={`${s.float} absolute left-[7%] top-[8%] max-w-[17rem]`}>
            <p className="mb-1 pl-1 text-[11px] text-[rgba(255,255,255,0.45)]">Krisha</p>
            <div className={`${s.imsg} rounded-[20px] rounded-bl-[6px] px-3.5 py-2.5 text-[14px] leading-snug`}>@huddle bring in someone for dinner on abbot kinney</div>
          </div>
          <div className={`${s.floatSlow} ${s.glass} absolute right-[6%] top-[22%] w-[19rem] rounded-[20px] p-4`}>
            <div className="mb-2 flex items-center justify-between text-[11px] text-[rgba(255,255,255,0.55)]">
              <span>🍜 Juno · food</span><ArrowUpRight className="size-3.5 text-[rgba(255,255,255,0.60)]" />
            </div>
            <p className="text-[14px] leading-snug text-[rgba(255,255,255,0.90)]">gjelina, $$$, 4.3★, wood-fired and loud<br />the butcher's daughter, $$, 4.4★<br />both 6 min from the pier</p>
          </div>
          <div className={`${s.float} ${s.glass} absolute left-[10%] top-[62%] w-[15rem] rounded-[20px] p-4`} style={{ animationDelay: "-3s" }}>
            <div className="mb-1 text-[11px] text-[rgba(255,255,255,0.55)]">💸 Penny · per person so far</div>
            <div className="font-display text-[34px] font-bold leading-none tracking-tight">$398</div>
            <div className="mt-2 h-[3px] w-full rounded-full bg-[rgba(255,255,255,0.10)]"><div className="h-full w-[62%] rounded-full bg-[rgba(255,255,255,0.80)]" /></div>
          </div>
        </div>
      </section>
    </div>
  );
}
