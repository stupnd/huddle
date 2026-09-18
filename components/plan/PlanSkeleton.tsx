import { Skeleton } from "@/components/ui/skeleton";

/** loading state shaped like the real plan: a day rail and three stop cards */
export function PlanSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="loading the plan">
      <div className="flex gap-0.5">
        <Skeleton className="h-7 w-16 rounded-lg" />
        <Skeleton className="h-7 w-16 rounded-lg" />
        <Skeleton className="h-7 w-16 rounded-lg" />
      </div>
      <Skeleton className="h-4 w-24" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid grid-cols-[3.5rem_1fr] gap-1 md:grid-cols-[4.5rem_1fr]">
          <Skeleton className="mt-2 h-2.5 w-6 justify-self-end" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ))}
    </div>
  );
}
