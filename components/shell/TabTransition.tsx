"use client";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { tabTransition } from "@/lib/design/tokens";

/**
 * Crossfade with a small slide when the tab changes. Keyed on the pathname so a
 * new route mounts fresh. App Router unmounts the old page before we can exit it,
 * so only the enter animates; that reads as a crossfade against the dark canvas.
 */
export function TabTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <motion.div key={pathname} variants={tabTransition} initial="initial" animate="animate" className="min-w-0">
      {children}
    </motion.div>
  );
}
