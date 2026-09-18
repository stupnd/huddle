"use client";
import { MotionConfig } from "framer-motion";
import { Tooltip } from "radix-ui";
import { ToastProvider } from "@/components/ui/toast";

/** Client-side wrappers for the whole app. reducedMotion="user" makes every framer animation obey the OS setting. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <Tooltip.Provider delayDuration={300} skipDelayDuration={200}>
        <ToastProvider>{children}</ToastProvider>
      </Tooltip.Provider>
    </MotionConfig>
  );
}
