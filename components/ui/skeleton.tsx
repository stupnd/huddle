import { cn } from "@/lib/utils";

/** Loading placeholder shaped like the content it stands in for. Never a spinner. */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden className={cn("skeleton", className)} {...props} />;
}
