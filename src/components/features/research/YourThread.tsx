"use client";

import type { Id } from "../../../../convex/_generated/dataModel";
import ThreadSectionView from "./ThreadSectionView";
import { useTopicThread } from "./useTopicThread";

/** The "YOUR THREAD" section of a topic board, wired to the topic's thread draft. */
export default function YourThread({ topicId, timezone }: { topicId: Id<"topics">; timezone: string | undefined }) {
  const thread = useTopicThread(topicId, timezone);
  return <ThreadSectionView thread={thread} topicId={topicId} />;
}
