import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/common/PageSkeletons";
import { AnalyticsDashboard } from "@/features/analytics/components/AnalyticsDashboard";

// The view, period and filters live in the address bar and are read in the browser (useSearchParams), so the boundary
// lets the rest of the page render while the browser reads them.
export default function Page() {
  return (
    <Suspense fallback={<ListPageSkeleton stats={5} />}>
      <AnalyticsDashboard />
    </Suspense>
  );
}
