"use client";

import type { ReactNode } from "react";
import AutoTextarea from "@/components/features/studio/AutoTextarea";
import type { DraftView } from "@/components/features/studio/types";
import { THREADS_POST_LIMIT, charLen } from "@/lib/draftText";
import type { Readiness } from "@/lib/studioModel";
import { useTwoTap } from "@/lib/useTwoTap";

export interface ThreadsCarouselProps {
  /** The Threads text as an editable draft; undefined while the carousel is going to Instagram only. */
  view?: DraftView;
  readiness: Readiness;
  /** "THU 15 OCT · 09:30": the next open Threads slot. */
  target?: string;
  /** Set when the carousel is already queued on Threads. */
  queuedWhen?: string | null;
  /** Public URLs of the carousel's images, in order: the same images the Instagram post uses. */
  images: string[];
  /** The Threads text is being written. */
  writing: boolean;
  error: string | null;
  /** Any generation is running: only one runs at a time. */
  busy: boolean;
  /** Write (or rewrite) the Threads text from the slides and the caption. */
  onWrite: () => void;
  /** Put the carousel on Threads and write the text yourself. */
  onWriteMyself: () => void;
  /** Take the carousel off Threads (refused while it has a Threads post). */
  onRemove: () => void;
  /** Show the Instagram column's Carousel tab, where the slides and images are edited. */
  onOpenCarousel: () => void;
  /** The "In this queue" switch. */
  queueToggle?: ReactNode;
}

/**
 * The Threads column's Carousel view: the text that goes with the carousel's images on Threads. The images
 * and slides are the Instagram carousel's (one set, edited there); only the words are different. Threads
 * takes 500 characters, with no hashtags.
 */
export default function ThreadsCarouselView(p: ThreadsCarouselProps) {
  const removeTap = useTwoTap();
  const length = p.view ? charLen(p.view.body.trim()) : 0;
  const over = length - THREADS_POST_LIMIT;

  if (p.writing) {
    return (
      <div aria-busy="true" className="studio-skel">
        <span className="sq-sk sq-sk-dk studio-sk-line" />
        <span className="sq-sk sq-sk-dk studio-sk-line" data-w="88" />
        <span className="sq-sk sq-sk-dk studio-sk-line" data-w="55" />
        <span className="t-mono studio-foot-hot">WRITING THE THREADS TEXT…</span>
      </div>
    );
  }

  if (!p.view) {
    return (
      <div className="studio-th-cr">
        <p className="studio-empty-copy">
          This carousel is going to Instagram only. Add it to Threads and it posts the same images with a short text of its own.
        </p>
        {p.error && (
          <p className="studio-inline-error" role="alert">
            {p.error}
          </p>
        )}
        <div className="studio-actions-row">
          <button type="button" className="sq-btn sq-btn-sm sq-btn-light" disabled={p.busy} onClick={p.onWrite}>
            Write the Threads text
          </button>
          <button type="button" className="sq-btn sq-btn-sm sq-btn-light" disabled={p.busy} onClick={p.onWriteMyself}>
            Write it myself
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="studio-th-cr">
      <div className="studio-th-cr-head">
        <span className="t-meta">
          THREADS TEXT · {length} / {THREADS_POST_LIMIT}
        </span>
        {over > 0 && <span className="sq-pill sq-pill-bad">OVER BY {over}</span>}
        {over <= 0 && length === 0 && <span className="t-meta studio-muted">EMPTY: POSTS THE IMAGES ONLY</span>}
      </div>
      <AutoTextarea
        className="studio-textarea studio-textarea-block"
        aria-label="Threads text for the carousel"
        aria-invalid={over > 0 || undefined}
        placeholder="One idea in plain words, and something that makes people swipe."
        value={p.view.body}
        onChange={(e) => p.view?.onChange(e.target.value)}
        onBlur={p.view.onBlur}
      />
      {p.images.length > 0 ? (
        <ul className="studio-th-strip" aria-label={`The ${p.images.length} images this carousel posts`}>
          {p.images.map((src, i) => (
            <li key={`${src}-${i}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Slide ${i + 1}`} width={48} height={60} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-meta studio-muted">NO IMAGES YET · DRAW THE SLIDES IN THE INSTAGRAM CAROUSEL TAB</p>
      )}
      <p className="t-meta studio-muted">
        The same images as the Instagram carousel.{" "}
        <button type="button" className="studio-linkbtn" onClick={p.onOpenCarousel}>
          Edit them in its Carousel tab
        </button>
      </p>
      {p.error && (
        <p className="studio-inline-error" role="alert">
          {p.error}
        </p>
      )}
      <div className="studio-actions-row">
        <button type="button" className="sq-btn sq-btn-sm sq-btn-light" disabled={p.busy} aria-label="Rewrite the Threads text" onClick={p.onWrite}>
          Rewrite text
        </button>
        {p.readiness.state !== "queued" && (
          <button
            type="button"
            className="sq-btn sq-btn-sm sq-btn-light"
            aria-pressed={removeTap.armed}
            onClick={() => removeTap.tap(p.onRemove)}
          >
            {removeTap.armed ? "Tap again" : "Take off Threads"}
          </button>
        )}
      </div>
    </div>
  );
}
