import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * shadcn convention: merge conditional classes and dedupe conflicting Tailwind utilities.
 * tailwind-merge is taught the type scale from styles/tokens.css so a size like
 * text-body is never mistaken for a color and made to fight text-ink.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display-2xl", "display-xl", "display-lg", "display-md", "display-sm", "body-lg", "body", "body-sm", "micro", "figure-lg", "figure"] }],
      "font-family": [{ font: ["display", "body"] }],
      tracking: [{ tracking: ["display", "tight", "normal", "wide"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
