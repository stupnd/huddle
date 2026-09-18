"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { agentEnter } from "@/lib/design/tokens";
import { Button } from "./button";
import { cn } from "@/lib/utils";

/**
 * Toasts: one line, bottom of the viewport, with an optional single action.
 * Errors stay until dismissed; everything else leaves after a few seconds.
 */

type Toast = { id: number; text: string; tone: "neutral" | "error"; action?: { label: string; onClick: () => void } };
type ToastApi = { notify: (text: string, opts?: { tone?: Toast["tone"]; action?: Toast["action"] }) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const notify = useCallback<ToastApi["notify"]>(
    (text, opts) => {
      const id = ++seq.current;
      const tone = opts?.tone ?? "neutral";
      setToasts((t) => [...t.slice(-2), { id, text, tone, action: opts?.action }]);
      if (tone !== "error") setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-(--z-toast) flex flex-col items-center gap-1 px-2 pb-2" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              variants={agentEnter}
              initial="initial"
              animate="animate"
              exit="exit"
              layout
              className={cn(
                "pointer-events-auto flex w-full max-w-(--container-reading) items-center gap-1 rounded-full border py-0.5 pr-0.5 pl-2 text-body-sm",
                t.tone === "error" ? "border-danger/40 bg-danger-soft text-ink" : "border-line-strong bg-surface-3 text-ink",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{t.text}</span>
              {t.action && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </Button>
              )}
              <Button size="icon-sm" variant="quiet" aria-label="dismiss" onClick={() => dismiss(t.id)}>
                <X />
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
