export type TopicStatus = "drafting" | "ready" | "queued" | "done";

/**
 * Ritual order rank: unqueued statuses first so the weekly ritual always
 * starts with what still needs drafting.
 */
const RANK: Record<TopicStatus, number> = {
  drafting: 0,
  ready: 1,
  queued: 2,
  done: 3,
};

/** Oldest first within a rank — the ritual is FIFO. */
export function compareTopics(
  a: { status: TopicStatus; createdAt: number },
  b: { status: TopicStatus; createdAt: number }
): number {
  return RANK[a.status] - RANK[b.status] || a.createdAt - b.createdAt;
}
