import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/common/PageSkeletons";
import { AllTasksList } from "@/features/tasks/components/AllTasksList";

// The filters live in the address bar and are read in the browser (useSearchParams), so this page does not wait for the
// request's search params. The boundary is what lets the rest of the page render while the browser reads them.
export default function Page() {
  return (
    <Suspense fallback={<ListPageSkeleton stats={0} />}>
      <AllTasksList />
    </Suspense>
  );
}
