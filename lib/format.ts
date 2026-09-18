/** Formatting helpers. Every number the UI shows passes through one of these so it carries a unit. */

const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function money(amount: number, currency: string, opts: { cents?: boolean } = {}) {
  const key = `${currency}:${opts.cents ? "c" : "w"}`;
  let f = currencyFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: opts.cents ? 2 : 0,
      minimumFractionDigits: opts.cents ? 2 : 0,
    });
    currencyFormatters.set(key, f);
  }
  return f.format(amount);
}

const shortDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const monthOnly = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const dayOnly = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" });

function asUTC(iso: string) {
  // date-only strings are parsed as UTC midnight; keep formatting in UTC so the day never shifts
  return new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
}

/** "oct 9 to 13" when same month, "oct 30 to nov 2" otherwise */
export function dateRange(start: string, end: string) {
  const a = asUTC(start);
  const b = asUTC(end);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  const left = shortDay.format(a);
  const right = sameMonth ? dayOnly.format(b) : shortDay.format(b);
  return `${left} to ${right}`.toLowerCase();
}

export function dayLabel(iso: string) {
  return { weekday: weekday.format(asUTC(iso)).toLowerCase(), date: `${monthOnly.format(asUTC(iso))} ${dayOnly.format(asUTC(iso))}`.toLowerCase() };
}

export function nightsBetween(start: string, end: string) {
  return Math.round((asUTC(end).getTime() - asUTC(start).getTime()) / 86_400_000);
}

/** "just now", "4m ago", "2h ago", "3d ago" */
export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** "open 2d", "open 4h", "open 12m" for decision threads */
export function openFor(iso: string, now = Date.now()) {
  return timeAgo(iso, now).replace(" ago", "").replace("just now", "under a minute");
}

/** "9:30am" from "09:30" */
export function clock(t: string) {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

/** "1h 20m" or "45m" */
export function minutes(min: number) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
