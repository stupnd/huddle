"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { spring } from "@/lib/design/tokens";
import { needsYouCount } from "@/lib/domain/select";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { useShell } from "./ShellProvider";

/**
 * Primary tabs. URL routed (/trip/[id]/<tab>), so every tab is deep linkable.
 * Keyboard: 1 to 5 jump straight to a tab from anywhere on the page unless focus is
 * in a text field; left and right arrows move between tabs when one is focused.
 * The active pill is a shared layout element so it glides between tabs.
 */

export const TABS = [
  { slug: "plan", label: "plan" },
  { slug: "decisions", label: "decisions" },
  { slug: "crew", label: "crew" },
  { slug: "money", label: "money" },
  { slug: "activity", label: "activity" },
] as const;

export type TabSlug = (typeof TABS)[number]["slug"];

export function TabNav() {
  const { tripId, snapshot } = useShell();
  const pathname = usePathname();
  const router = useRouter();
  const listRef = useRef<HTMLDivElement>(null);
  const active = TABS.find((t) => pathname.startsWith(`/trip/${tripId}/${t.slug}`))?.slug ?? "plan";
  const needsYou = needsYouCount(snapshot);

  // digit shortcuts, global
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= TABS.length) {
        e.preventDefault();
        router.push(`/trip/${tripId}/${TABS[n - 1].slug}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, tripId]);

  // arrow keys inside the nav
  const onNavKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    const links = Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-tab]") ?? []);
    const i = links.findIndex((l) => l === document.activeElement);
    if (i === -1) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? links.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + links.length) % links.length;
    links[next]?.focus();
  };

  return (
    <nav
      aria-label="trip sections"
      className="sticky top-0 z-(--z-sticky) bg-canvas/85 backdrop-blur-md hairline-t"
    >
      <div ref={listRef} onKeyDown={onNavKey} className="mx-auto flex h-(--height-tabbar) w-full max-w-(--container-shell) items-center gap-0.5 overflow-x-auto px-2 scrollbar-none md:px-4">
        {TABS.map((tab, i) => {
          const isActive = tab.slug === active;
          const badge = tab.slug === "decisions" && needsYou > 0 ? needsYou : null;
          return (
            <Link
              key={tab.slug}
              href={`/trip/${tripId}/${tab.slug}`}
              data-tab={tab.slug}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group relative flex h-4 shrink-0 items-center gap-1 rounded-full px-2 text-body font-medium outline-offset-0",
                "transition-colors duration-(--duration-fast)",
                isActive ? "text-accent-ink" : "text-ink-2 hover:text-ink",
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="tab-active"
                  transition={spring.snappy}
                  className="absolute inset-0 rounded-full bg-accent"
                  aria-hidden
                />
              )}
              <span className="relative">{tab.label}</span>
              {badge !== null && (
                <span
                  className={cn(
                    "relative flex h-2.5 min-w-2.5 items-center justify-center rounded-full px-0.5 text-micro font-semibold figures",
                    isActive ? "bg-accent-ink/15 text-accent-ink" : "bg-contested-soft text-contested",
                  )}
                  aria-label={`${badge} need you`}
                >
                  {badge}
                </span>
              )}
              {!isActive && (
                <Kbd className="relative hidden opacity-0 transition-opacity duration-(--duration-fast) group-hover:opacity-100 group-focus-visible:opacity-100 md:inline-flex">
                  {i + 1}
                </Kbd>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}
