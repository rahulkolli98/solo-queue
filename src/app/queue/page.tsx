import { Suspense } from "react";
import QueueBoard from "@/components/features/queue/QueueBoard";
import QueueSkeleton from "@/components/skeletons/QueueSkeleton";

export default function QueuePage() {
  // QueueBoard reads ?slot= (a link from Today opens that post's drawer), which needs a Suspense boundary.
  return (
    <Suspense fallback={<QueueSkeleton />}>
      <QueueBoard />
    </Suspense>
  );
}
