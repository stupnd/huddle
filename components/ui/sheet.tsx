"use client";
import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { AnimatePresence, motion } from "framer-motion";
import { spring, duration } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";

/**
 * Sheet: a panel that slides in from the right over a scrim. Built on Radix Dialog
 * for focus trapping and escape handling, animated with framer so it uses the same
 * spring as everything else. The drawer uses this on narrow screens.
 */

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
};

export function Sheet({ open, onOpenChange, title, description, children, className }: SheetProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-(--z-overlay) bg-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: duration.base }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild forceMount>
              <motion.div
                className={cn(
                  "fixed inset-y-0 right-0 z-(--z-overlay) flex w-[min(100vw,var(--width-drawer))] flex-col",
                  "border-l border-line bg-surface-1 outline-none",
                  className,
                )}
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%", transition: { duration: duration.base } }}
                transition={spring.drawer}
              >
                <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
                {description && <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>}
                {children}
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
