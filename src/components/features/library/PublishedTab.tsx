"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import Skeleton from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { blobFor, postcardMeta, restLabel, tiltFor, whenLabel } from "@/lib/libraryBoard";
import { refusalText } from "@/lib/refusalText";
import { useNow } from "@/lib/useNow";
import { api } from "../../../../convex/_generated/api";
import LibraryRail, { FramesStrip } from "./LibraryRail";
import { pillarColorVar, type Frame, type LibraryFilters, type Pillar, type PublishedPost } from "./types";

function Postcard({
  post,
  index,
  pillars,
  tz,
}: {
  post: PublishedPost;
  index: number;
  pillars: Pillar[];
  tz: string;
}) {
  const requeue = useMutation(api.queueBoard.requeue);
  const setEvergreen = useMutation(api.queueBoard.setEvergreen);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const isThreads = post.platform === "threads";
  const color = pillarColorVar(pillars, post.pillarKey);

  async function onRequeue() {
    setBusy(true);
    try {
      const res = await requeue({ id: post.slotId, tz });
      toast({
        title: "Requeued",
        detail: `Back in the queue for ${whenLabel(res.scheduledAt, tz)}. The original stays here as history.`,
        actions: [{ label: "View queue", href: "/queue", variant: "primary" }],
      });
    } catch (err) {
      toast({ title: "Not requeued", detail: refusalText(err, "Could not requeue this post. Try again."), tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  async function onEvergreen() {
    setBusy(true);
    try {
      await setEvergreen({ id: post.slotId, evergreen: !post.evergreen });
    } catch (err) {
      toast({ title: "Could not change the evergreen mark", detail: refusalText(err, "Try again."), tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className={`lb-card ${isThreads ? "lb-card-th" : ""}`}
      style={{
        transform: `rotate(${tiltFor(index)}deg)`,
        ...(isThreads ? {} : { background: color }),
      }}
    >
      <div className="lb-card-head">
        <span className="t-mono">{postcardMeta(post, tz)}</span>
        {post.evergreen && <span className="lb-evergreen">EVERGREEN</span>}
      </div>
      {isThreads ? (
        <p className="lb-clip">{post.body}</p>
      ) : (
        <>
          <span className="lb-blob" style={{ borderRadius: blobFor(index) }} aria-hidden="true" />
          <span className="lb-ig-text">{post.topicTitle}</span>
        </>
      )}
      <div className="lb-pillar">
        <span className="lb-dot" style={{ background: color }} aria-hidden="true" />
        <span className="t-meta">{post.pillarName.toUpperCase()}</span>
        {!post.canRequeue && <span className="t-meta lb-rest">{restLabel(post.restDaysLeft)}</span>}
      </div>
      <div className="lb-actions">
        <button type="button" className="lb-act" disabled={busy} onClick={() => void onRequeue()}>
          Requeue
        </button>
        <button
          type="button"
          className="lb-act"
          aria-pressed={post.evergreen}
          title={post.evergreen ? "Evergreen: it can come back around. Tap to turn off." : "Mark as evergreen so it can come back around"}
          disabled={busy}
          onClick={() => void onEvergreen()}
        >
          Evergreen
        </button>
      </div>
    </article>
  );
}

/** Library › Published: tilted postcards of what went out, with Requeue and the evergreen mark. */
export default function PublishedTab({
  filters,
  pillars,
  tz,
  frames,
  voice,
  learnedFrom,
}: {
  filters: LibraryFilters;
  pillars: Pillar[];
  tz: string;
  frames: Frame[] | undefined;
  voice: string;
  learnedFrom: number;
}) {
  const now = useNow();
  const posts = useQuery(api.library.published, {
    now,
    pillar: filters.pillar || undefined,
    platform: filters.platform || undefined,
    search: filters.search.trim() || undefined,
  });
  const filtered = Boolean(filters.pillar || filters.platform || filters.search.trim());

  return (
    <div className="lb-grid">
      <div className="lb-main">
        <FramesStrip frames={frames} />
        <div className="lb-cards">
          {posts === undefined ? (
            <PostcardSkeletons />
          ) : posts.length === 0 ? (
            <div className="lb-empty">
              <b>{filtered ? "Nothing matches" : "Nothing published yet"}</b>
              <span>
                {filtered
                  ? "Clear the search or the filters to see everything that went out."
                  : "Posts land here once they go out from the queue. Mark the ones that hold up as evergreen and they can come around again."}
              </span>
            </div>
          ) : (
            posts.map((p, i) => <Postcard key={p.slotId} post={p} index={i} pillars={pillars} tz={tz} />)
          )}
        </div>
      </div>
      <LibraryRail frames={frames} voice={voice} learnedFrom={learnedFrom} />
    </div>
  );
}

export function PostcardSkeletons() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="lb-card lb-card-th" aria-hidden="true">
          <Skeleton w="55%" h={10} />
          <Skeleton w="96%" h={13} />
          <Skeleton w="90%" h={13} />
          <Skeleton w="60%" h={13} />
        </div>
      ))}
    </>
  );
}
