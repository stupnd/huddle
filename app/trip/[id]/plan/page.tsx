import { Suspense } from "react";
import { PlanTab } from "@/components/plan/PlanTab";
import { PlanSkeleton } from "@/components/plan/PlanSkeleton";

export default function PlanPage() {
  return (
    <Suspense fallback={<PlanSkeleton />}>
      <PlanTab />
    </Suspense>
  );
}
