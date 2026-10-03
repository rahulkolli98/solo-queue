import { Suspense } from "react";
import ResearchSkeleton from "@/components/skeletons/ResearchSkeleton";
import ResearchScreen from "@/components/features/research/ResearchScreen";

export const metadata = { title: "Research · Solo Queue" };

export default function ResearchPage() {
  return (
    <Suspense fallback={<ResearchSkeleton />}>
      <ResearchScreen />
    </Suspense>
  );
}
