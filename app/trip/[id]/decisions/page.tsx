import { Suspense } from "react";
import { DecisionsTab } from "@/components/decisions/DecisionsTab";
import { TabPlaceholder } from "@/components/shell/TabPlaceholder";

export default function DecisionsPage() {
  return (
    <Suspense fallback={<TabPlaceholder tab="decisions" />}>
      <DecisionsTab />
    </Suspense>
  );
}
