"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [needsName, setNeedsName] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = async (url: string, body: unknown) => {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? "Something went wrong");
    return j;
  };

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { const j = await post("/api/auth/code", { phone }); setSentTo(j.to); }
    catch (err) { setError(err instanceof Error ? err.message : "Couldn't send a code"); }
    finally { setBusy(false); }
  };

  const finish = () => { router.push(next); router.refresh(); };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const j = await post("/api/auth/verify", { phone, code });
      if (j.needsName) setNeedsName(true); else finish();
    }
    catch (err) { setError(err instanceof Error ? err.message : "Couldn't verify"); }
    finally { setBusy(false); }
  };

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await post("/api/auth/name", { name }); finish(); }
    catch (err) { setError(err instanceof Error ? err.message : "Couldn't save that"); }
    finally { setBusy(false); }
  };

  const field = "w-full rounded-xl border border-line bg-surface-1 px-2 py-2 text-body text-ink outline-none focus-visible:border-line-strong figures";

  if (needsName) {
    return (
      <form onSubmit={saveName} className="flex max-w-[24em] flex-col gap-2">
        <p className="text-body text-ink-2">you're in. one more thing so your friends see a name, not a number.</p>
        <label htmlFor="name" className="text-body-sm text-ink-3">what should we call you?</label>
        <input id="name" name="name" type="text" autoComplete="given-name" placeholder="Krisha" maxLength={40} required autoFocus
          value={name} onChange={(e) => setName(e.target.value)} className={field} />
        <Button type="submit" variant="primary" size="md" disabled={busy || !name.trim()}>{busy ? "saving…" : "that's me"}</Button>
        {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
        <button type="button" className="self-start text-body-sm text-ink-3 underline underline-offset-2" onClick={finish}>skip for now</button>
      </form>
    );
  }

  if (!sentTo) {
    return (
      <form onSubmit={sendCode} className="flex max-w-[24em] flex-col gap-2">
        <label htmlFor="phone" className="text-body-sm text-ink-3">your number</label>
        <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+1 (613) 555 0101" required
          value={phone} onChange={(e) => setPhone(e.target.value)} className={field} />
        <Button type="submit" variant="primary" size="md" disabled={busy}>{busy ? "sending…" : "text me a code"}</Button>
        {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
        <p className="text-body-sm text-ink-3">only numbers huddle already knows get a code. if you're on the waitlist, you'll hear from us first.</p>
      </form>
    );
  }
  return (
    <form onSubmit={verify} className="flex max-w-[24em] flex-col gap-2">
      <p className="text-body text-ink-2">sent to <span className="figures">{sentTo}</span>. check your messages.</p>
      <label htmlFor="code" className="text-body-sm text-ink-3">the 6-digit code</label>
      <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} placeholder="482 913" required autoFocus
        value={code} onChange={(e) => setCode(e.target.value)} className={`${field} tracking-[0.2em]`} />
      <Button type="submit" variant="primary" size="md" disabled={busy}>{busy ? "checking…" : "sign in"}</Button>
      {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
      <button type="button" className="self-start text-body-sm text-ink-3 underline underline-offset-2" onClick={() => { setSentTo(null); setCode(""); setError(null); }}>
        different number
      </button>
    </form>
  );
}
