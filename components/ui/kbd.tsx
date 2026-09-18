import { cn } from "@/lib/utils";

/** Keyboard hint. Used next to tabs and actions that have a shortcut. */
export function Kbd({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-2.5 min-w-2.5 items-center justify-center rounded-xs border border-line px-0.5",
        "font-body text-micro text-ink-3 figures",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
