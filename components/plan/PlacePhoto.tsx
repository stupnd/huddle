import { cn } from "@/lib/utils";

/**
 * A place image with the house treatment: desaturated, duotoned toward the accent.
 * With no photo, a typographic placeholder built from the place name. Never a
 * colored tile, never an icon.
 */
export function PlacePhoto({ name, url, className }: { name: string; url?: string | null; className?: string }) {
  if (url) {
    return (
      <div className={cn("photo-duotone overflow-hidden rounded-md bg-surface-2", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" loading="lazy" className="size-full object-cover" />
      </div>
    );
  }
  const words = name.split(/[\s,]+/).filter(Boolean);
  const mark = words.length >= 2 ? `${words[0][0]}${words[1][0]}` : name.slice(0, 2);
  return (
    <div className={cn("flex items-end overflow-hidden rounded-md bg-surface-2 p-1", className)} aria-hidden>
      <span className="font-display text-display-md leading-none text-ink-3 tracking-display uppercase">{mark}</span>
    </div>
  );
}
