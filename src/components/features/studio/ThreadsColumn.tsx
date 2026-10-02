"use client";

import { useState } from "react";
import GenerationErrorCard from "@/components/features/studio/GenerationErrorCard";
import ManualDraft from "@/components/features/studio/ManualDraft";
import { ThreadsAvatar } from "@/components/features/studio/glyphs";
import ThreadPostRow from "@/components/features/studio/ThreadPostRow";
import type { DraftView, GenState } from "@/components/features/studio/types";
import {
  THREADS_POST_LIMIT,
  cleanThread,
  overPostCount,
  parseThread,
  serializeThread,
  splitInTwo,
  trimToFit,
} from "@/lib/draftText";
import { beatLabel, type Readiness } from "@/lib/studioModel";

/** Board 02 / 07c-07e: the ink Threads column. */
export default function ThreadsColumn({
  view,
  beats,
  frameName,
  readiness,
  target,
  queuedWhen,
  gen,
  placeholders,
  emptyCopy,
}: {
  view?: DraftView;
  beats?: { label: string }[];
  frameName?: string;
  readiness: Readiness;
  /** "THU 15 OCT · 09:30": the next open Threads slot. */
  target?: string;
  /** Set when this thread is already in the queue. */
  queuedWhen?: string | null;
  gen: GenState;
  /** Dashed beat boxes shown before anything is written. */
  placeholders: string[];
  emptyCopy: string;
}) {
  const [manual, setManual] = useState(false);
  const posts = view ? parseThread(view.body) : [];

  function replace(index: number, next: string[]) {
    if (!view) return;
    const all = [...posts];
    all.splice(index, 1, ...next);
    view.onChange(serializeThread(all));
  }

  function tidy() {
    if (!view) return;
    const cleaned = cleanThread(parseThread(view.body));
    if (cleaned.length > 0 && serializeThread(cleaned) !== view.body) view.onChange(serializeThread(cleaned));
    view.onBlur();
  }

  const overCount = overPostCount(posts);
  const count = beats?.length || placeholders.length || 4;

  let body;
  if (gen.writing) {
    body = (
      <div className="studio-posts" aria-busy="true">
        {Array.from({ length: count }, (_, i) => (
          <div className="studio-post" key={i} data-step={Math.min(i, 2)}>
            <div className="studio-rail">
              <span className="studio-num" aria-hidden="true">
                {i + 1}
              </span>
            </div>
            <div className="studio-skel">
              <span className="sq-sk sq-sk-dk studio-sk-line" />
              <span className="sq-sk sq-sk-dk studio-sk-line" data-w="88" />
              <span className="sq-sk sq-sk-dk studio-sk-line" data-w="55" />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (gen.error && !view) {
    body = manual ? (
      <ManualDraft label="Threads post" limit={THREADS_POST_LIMIT} />
    ) : (
      <GenerationErrorCard
        title="Couldn't write the thread"
        message={gen.error}
        onRetry={gen.onRetry}
        busy={gen.retrying}
        onWriteMyself={() => setManual(true)}
      />
    );
  } else if (!view) {
    body = (
      <>
        {placeholders.map((label, i) => (
          <div className="studio-ghost" key={label}>
            <span className="t-meta">
              {i + 1} · {label.toUpperCase()}
            </span>
          </div>
        ))}
        <p className="studio-empty-copy">{emptyCopy}</p>
      </>
    );
  } else {
    body = (
      <div className="studio-posts">
        {posts.map((text, i) => (
          <ThreadPostRow
            key={i}
            index={i}
            text={text}
            beat={beatLabel(beats, i)}
            last={i === posts.length - 1}
            onChange={(next) => replace(i, [next])}
            onBlur={tidy}
            onTrim={() => replace(i, [trimToFit(text, THREADS_POST_LIMIT)])}
            onSplit={() => replace(i, splitInTwo(text))}
          />
        ))}
      </div>
    );
  }

  return (
    <section className="studio-col studio-col-threads" aria-label="Threads thread">
      <div className="studio-colhead">
        <div className="studio-colhead-title">
          <ThreadsAvatar />
          <h2 className="t-title">Threads</h2>
        </div>
        {view && !gen.writing && (
          <span className="t-meta studio-stamp">
            V{view.draft.templateVersion}
            {frameName ? ` · ${frameName.toUpperCase()}` : ""}
          </span>
        )}
      </div>
      {body}
      <div className="studio-colfoot">
        {gen.writing ? (
          <>
            <span className="t-mono studio-foot-hot">WRITING THE THREAD…</span>
            <span className="t-meta studio-foot-dim">{gen.elapsed} ELAPSED</span>
          </>
        ) : view && readiness.state === "over" ? (
          <>
            <span className="t-mono studio-foot-bad">
              {overCount} {overCount === 1 ? "POST" : "POSTS"} OVER THE LIMIT
            </span>
            <span className="t-meta studio-foot-dim">QUEUE BLOCKED FOR THIS THREAD</span>
          </>
        ) : view ? (
          <span className="t-mono studio-foot-hot">
            {posts.length}-POST THREAD
            <br />
            {readiness.state === "queued"
              ? `QUEUED${queuedWhen ? ` → ${queuedWhen}` : ""}`
              : target
                ? `→ ${target}`
                : "NO OPEN SLOT IN THE NEXT 2 WEEKS"}
          </span>
        ) : null}
      </div>
    </section>
  );
}
