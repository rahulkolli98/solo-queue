import { notFound } from "next/navigation";
import { Suspense } from "react";
import StudioWorkspace from "@/components/features/studio/StudioWorkspace";
import StudioSkeleton from "@/components/skeletons/StudioSkeleton";

/** Convex document ids are 32 lowercase letters and digits; anything else cannot be a topic. */
const TOPIC_ID = /^[a-z0-9]{32}$/;

export default async function TopicStudioPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  if (!TOPIC_ID.test(topicId)) notFound();
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <StudioWorkspace topicId={topicId} />
    </Suspense>
  );
}
