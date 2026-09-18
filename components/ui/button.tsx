import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button. Pills by default; the accent is reserved for the primary variant so it
 * stays rare on any given screen. Icon-only buttons use size="icon" and must pass aria-label.
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full font-medium",
    "transition-[background-color,color,transform] duration-(--duration-fast) ease-(--ease-out)",
    "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-2",
  ],
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-ink hover:bg-accent-hover active:bg-accent-pressed",
        secondary: "bg-surface-2 text-ink border border-line hover:bg-surface-3 hover:border-line-strong",
        ghost: "text-ink-2 hover:text-ink hover:bg-surface-2",
        quiet: "text-ink-3 hover:text-ink-2 hover:bg-surface-2",
        danger: "bg-danger-soft text-danger hover:bg-surface-3",
      },
      size: {
        sm: "h-4 px-2 text-body-sm",
        md: "h-5 px-2.5 text-body",
        lg: "h-6 px-3 text-body-lg",
        icon: "size-5",
        "icon-sm": "size-4 [&_svg]:size-2",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, buttonVariants };
