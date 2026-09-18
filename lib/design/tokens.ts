import type { Transition, Variants } from "framer-motion";

/**
 * Motion tokens. The CSS side of the system lives in styles/tokens.css; this file
 * holds the values that only JavaScript can express (spring physics, variants) plus
 * typed names for the CSS tokens so components never spell a raw value.
 *
 * Springs are tuned to settle inside 150 to 250ms. Nothing here overshoots by more
 * than a few percent; the system should feel quick and physical, not bouncy.
 */

export const spring = {
  /** tab indicators, chips, small state changes. ~180ms settle */
  snappy: { type: "spring", stiffness: 560, damping: 44, mass: 1 } as const,
  /** cards and panels entering. ~220ms settle */
  gentle: { type: "spring", stiffness: 380, damping: 38, mass: 1 } as const,
  /** the drawer sliding in. ~250ms settle, no overshoot */
  drawer: { type: "spring", stiffness: 420, damping: 46, mass: 1.1 } as const,
} satisfies Record<string, Transition>;

/** seconds, mirrors --duration-* in tokens.css for framer transitions that use tween */
export const duration = { fast: 0.15, base: 0.2, slow: 0.25 } as const;

/** tab content: crossfade with a small slide */
export const tabTransition: Variants = {
  initial: { opacity: 0, x: 6 },
  animate: { opacity: 1, x: 0, transition: spring.gentle },
  exit: { opacity: 0, x: -6, transition: { duration: duration.fast } },
};

/** anything an agent adds to the screen: rises in from just below */
export const agentEnter: Variants = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: spring.gentle },
  exit: { opacity: 0, y: -4, transition: { duration: duration.fast } },
};

/** list items staggering in behind a parent. short lists breathe; long ones must not take a second to appear */
export const listStagger: Variants = {
  animate: { transition: { staggerChildren: 0.04 } },
};
export const listStaggerDense: Variants = {
  animate: { transition: { staggerChildren: 0.015 } },
};

/**
 * Identity palette. Six hues declared in tokens.css as --color-avatar-1..6.
 * Class names are spelled out so Tailwind can see them at build time.
 */
export const avatarHueCount = 6;
export type AvatarHue = 1 | 2 | 3 | 4 | 5 | 6;

export const avatarBg: Record<AvatarHue, string> = {
  1: "bg-avatar-1", 2: "bg-avatar-2", 3: "bg-avatar-3", 4: "bg-avatar-4", 5: "bg-avatar-5", 6: "bg-avatar-6",
};
export const avatarText: Record<AvatarHue, string> = {
  1: "text-avatar-1", 2: "text-avatar-2", 3: "text-avatar-3", 4: "text-avatar-4", 5: "text-avatar-5", 6: "text-avatar-6",
};
export const avatarRing: Record<AvatarHue, string> = {
  1: "ring-avatar-1", 2: "ring-avatar-2", 3: "ring-avatar-3", 4: "ring-avatar-4", 5: "ring-avatar-5", 6: "ring-avatar-6",
};

/** stable 32-bit hash so the same name always lands on the same hue and mark */
export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function hueFor(seed: string): AvatarHue {
  return ((hashSeed(seed) % avatarHueCount) + 1) as AvatarHue;
}

/**
 * Breakpoints are declared by Tailwind (sm 40rem, md 48rem, lg 64rem, xl 80rem).
 * JS reads them from the stylesheet at runtime through useBreakpoint so this file
 * never restates a pixel value.
 */
export const breakpointVar = {
  sm: "--breakpoint-sm",
  md: "--breakpoint-md",
  lg: "--breakpoint-lg",
  xl: "--breakpoint-xl",
} as const;
export type Breakpoint = keyof typeof breakpointVar;
