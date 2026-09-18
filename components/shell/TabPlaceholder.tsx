import { Skeleton } from "@/components/ui/skeleton";

/** loading skeletons shaped like each tab's real layout. never a spinner. */
export function TabPlaceholder({ tab }: { tab: string }) {
  return (
    <section aria-busy="true" aria-label={`loading ${tab}`} className="flex flex-col gap-2">
      <div className="flex gap-1">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <div className="grid gap-1 md:grid-cols-2">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    </section>
  );
}
