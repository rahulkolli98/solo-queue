"use client";

import { useEffect, useRef, useState, type FocusEvent, type ReactNode } from "react";
import GenerateButton from "@/components/features/studio/GenerateButton";
import GenerationErrorCard from "@/components/features/studio/GenerationErrorCard";
import ManualThread from "@/components/features/studio/ManualThread";
import { ThreadsAvatar } from "@/components/features/studio/glyphs";
import ThreadPostRow from "@/components/features/studio/ThreadPostRow";
import type { DraftView, GenState } from "@/components/features/studio/types";
import {
  MAX_THREAD_POSTS,
  THREADS_POST_LIMIT,
  cleanThread,
  overPostCount,
  parseThread,
  serializeThread,
  splitInTwo,
  trimToFit,
} from "@/lib/draftText";
import { addToThread, moveInThread, postsLabel, removeFromThread } from "@/lib/studioCompose";
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
  onManualText,
  onSaveManual,
  writing,
  onWriting,
  expectedPosts,
  bannedWords,
  notice,
  onGenerate,
  busy = false,
  queueToggle,
}: {
  /** Write just the thread (Studio asks first when it would replace text). Omit to hide the button. */
  onGenerate?: () => void;
  /** Any generation is running: only one runs at a time. */
  busy?: boolean;
  /** The "In this queue" switch, shown in the footer once there is a thread that is not queued. */
  queueToggle?: ReactNode;
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
  /** The "Write it myself" box has (true) or lost (false) text that is not saved to the topic. */
  onManualText?: (hasText: boolean) => void;
  /** Store the "Write it myself" text as the topic's thread draft. */
  onSaveManual?: (text: string) => Promise<void>;
  /** The writer is open (Studio opens it for `?write=1`). Omit to let this column keep track itself. */
  writing?: boolean;
  onWriting?: (open: boolean) => void;
  /** How many posts the running generation was asked for (the skeleton shows that many). */
  expectedPosts?: number;
  /** The founder's never-use words (Settings, Voice): posts that use one are flagged. */
  bannedWords?: readonly string[];
  /** Phone only: the other platform needs the founder ("Instagram: 2 drafts need you"). */
  notice?: ReactNode;
}) {
  const [localManual, setLocalManual] = useState(false);
  const manual = writing ?? localManual;
  const setManual = (open: boolean) => {
    setLocalManual(open);
    onWriting?.(open);
  };
  const posts = view ? parseThread(view.body) : [];
  const atMax = posts.length >= MAX_THREAD_POSTS;
  const bodyText = view?.body;

  // After Add / Move / Remove, put focus where the founder is working (the ids are the first usable one).
  const focusNext = useRef<string[] | null>(null);
  useEffect(() => {
    const ids = focusNext.current;
    if (!ids) return;
    focusNext.current = null;
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el && !(el as HTMLButtonElement).disabled) {
        el.focus();
        break;
      }
    }
  }, [bodyText]);

  function commit(next: string, focus: string[]) {
    if (!view || next === view.body) return;
    focusNext.current = focus;
    view.onChange(next);
  }

  function move(index: number, direction: -1 | 1) {
    if (!view) return;
    const to = index + direction;
    commit(moveInThread(view.body, index, direction), [
      `studio-post-${to}-${direction === -1 ? "up" : "down"}`,
      `studio-post-${to}`,
    ]);
  }

  function remove(index: number) {
    if (!view) return;
    commit(removeFromThread(view.body, index), [`studio-post-${Math.min(index, posts.length - 2)}`]);
  }

  function add() {
    if (!view) return;
    commit(addToThread(view.body), [`studio-post-${posts.length}`]);
  }

  /** Leaving the whole thread (not moving between its posts and buttons) tidies blanks and saves now. */
  function leave(e: FocusEvent<HTMLDivElement>) {
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    tidy();
  }

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
  const count = expectedPosts ?? (beats?.length || placeholders.length || 4);

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
  } else if (!view && (gen.error || manual)) {
    body = manual ? (
      <ManualThread
        onText={onManualText}
        onSave={onSaveManual}
        onRetry={gen.onRetry}
        retrying={gen.retrying}
      />
    ) : (
      <GenerationErrorCard
        title="Couldn't write the thread"
        message={gen.error ?? ""}
        code={gen.errorCode}
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
        <div className="studio-actions-row studio-write-myself">
          {onGenerate && <GenerateButton has={false} busy={busy} onClick={onGenerate} what="thread" tone="light" />}
          <button type="button" className="sq-btn sq-btn-sm sq-btn-light" onClick={() => setManual(true)}>
            Write it myself
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <div className="studio-posts" onBlur={leave}>
        {posts.map((text, i) => (
          <ThreadPostRow
            key={i}
            index={i}
            text={text}
            beat={beatLabel(beats, i)}
            last={i === posts.length - 1}
            bannedWords={bannedWords}
            canRemove={posts.length > 1}
            onChange={(next) => replace(i, [next])}
            onTrim={() => replace(i, [trimToFit(text, THREADS_POST_LIMIT)])}
            onSplit={() => replace(i, splitInTwo(text))}
            onMove={(direction) => move(i, direction)}
            onRemove={() => remove(i)}
          />
        ))}
        <div className="studio-post-add">
          <button
            type="button"
            id="studio-add-post"
            className="sq-btn sq-btn-sm sq-btn-light"
            onClick={add}
            disabled={atMax}
            aria-describedby="studio-post-count"
          >
            + Add post
          </button>
          {onGenerate && <GenerateButton has busy={busy} onClick={onGenerate} what="thread" tone="light" />}
          <span className="t-meta studio-post-count" id="studio-post-count" data-full={atMax || undefined}>
            {postsLabel(posts.length)}
            {atMax ? " · THE MOST ONE THREAD CAN HAVE" : ""}
          </span>
        </div>
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
      {notice}
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
        {view && !gen.writing && readiness.state !== "queued" && queueToggle}
      </div>
    </section>
  );
}
