import Link from "next/link";
import ThreadWriter from "@/components/features/thread/ThreadWriter";
import { ArrowRightIcon } from "@/components/ui/icons";
import Skeleton, { LoadingRegion } from "@/components/ui/Skeleton";
import { EMPTY_THREAD_NOTE, SAVE_STATE_TEXT } from "@/lib/researchThread";
import type { TopicThread } from "./useTopicThread";

/** The loading shape of the section: a label, two post boxes and the button row. */
export function ThreadSectionSkeleton() {
  return (
    <section className="rs-thread" aria-label="Your thread">
      <LoadingRegion label="Loading your thread…">
        <Skeleton w={110} h={11} tone="yellow" />
        <Skeleton h={74} r={10} tone="yellow" />
        <Skeleton h={74} r={10} tone="yellow" />
        <div className="rs-thread-skel-row">
          <Skeleton w={120} h={36} r={18} tone="yellow" />
          <Skeleton w={150} h={36} r={18} tone="yellow" />
        </div>
      </LoadingRegion>
    </section>
  );
}

/**
 * "YOUR THREAD": the topic's thread, written post by post here and shared with
 * Studio (the same draft). Presentational: the state and actions come from
 * `useTopicThread`.
 */
export default function ThreadSectionView({ thread, topicId }: { thread: TopicThread; topicId: string }) {
  if (thread.status === "loading") return <ThreadSectionSkeleton />;

  if (thread.status === "gone") {
    return (
      <section className="rs-thread" aria-label="Your thread">
        <span className="t-meta rs-thread-label">YOUR THREAD</span>
        <p className="rs-thread-note" role="status">
          {thread.goneReason === "archived"
            ? "This topic is archived, so its thread can't be edited here. Restore the topic to keep writing."
            : "This topic was deleted, so its thread can't be edited here."}
        </p>
      </section>
    );
  }

  const queued = thread.queuedLabel !== null;
  const saveText = SAVE_STATE_TEXT[thread.save];
  const canSave = thread.checks.canSave && thread.save === "unsaved";
  const queueBlocked = !thread.checks.canQueue;
  const empty = thread.checks.postCount === 0;
  const reason = empty ? null : (thread.checks.saveReason ?? thread.checks.queueReason);

  return (
    <section
      className="rs-thread"
      aria-label="Your thread"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) thread.leave();
      }}
    >
      <div className="rs-thread-head">
        <span className="t-meta rs-thread-label">YOUR THREAD</span>
        <span className="t-meta rs-thread-state" data-state={thread.save} aria-live="polite">
          {saveText}
        </span>
      </div>

      {!thread.hasThread && thread.save === "empty" && <p className="rs-thread-note">{EMPTY_THREAD_NOTE}</p>}

      {thread.studioNewer && (
        <p className="rs-thread-note rs-thread-stale" role="status">
          <span>This thread was changed in Studio while you were editing. Saving here replaces that version.</span>
          <button type="button" className="sq-btn sq-btn-sm" onClick={thread.useStudioVersion}>
            Use the Studio version
          </button>
        </p>
      )}

      <ThreadWriter posts={thread.posts} onChange={thread.onChange} idPrefix={`rs-thread-${topicId}`} tone="paper" />

      {reason && (
        <p className="rs-thread-note rs-thread-reason" data-bad={thread.checks.overPosts.length > 0 || undefined}>
          {reason}
        </p>
      )}
      {thread.error && (
        <p className="rs-thread-note rs-thread-error" role="alert" data-bad="true">
          {thread.error}
        </p>
      )}

      <div className="rs-thread-actions">
        <button
          type="button"
          className="sq-btn sq-btn-sm sq-btn-dark"
          onClick={thread.saveNow}
          disabled={!canSave || thread.saving}
        >
          {thread.saving ? "Saving…" : "Save thread"}
        </button>
        {empty && thread.checks.saveReason && <span className="t-meta rs-thread-why">{thread.checks.saveReason}</span>}
        {thread.hasThread && !queued && (
          <button
            type="button"
            className="sq-btn sq-btn-sm sq-btn-primary"
            onClick={thread.queue}
            disabled={queueBlocked || thread.queuing || thread.saving}
          >
            {thread.queuing ? "Queueing…" : "Queue this thread"}
          </button>
        )}
        {queued && (
          <Link href="/queue" className="rs-thread-queued">
            {thread.queuedLabel}
          </Link>
        )}
        {thread.hasThread && (
          <Link
            href={thread.studioHref}
            className="sq-btn sq-btn-sm"
            onClick={(e) => {
              e.preventDefault();
              thread.openInStudio();
            }}
          >
            Open in Studio
            <ArrowRightIcon />
          </Link>
        )}
      </div>
    </section>
  );
}
