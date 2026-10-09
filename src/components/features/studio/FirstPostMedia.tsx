"use client";

import { useState } from "react";
import MediaPanel from "@/components/features/studio/MediaPanel";
import type { MediaActions } from "@/components/features/studio/useMediaActions";
import SegmentedControl from "@/components/ui/SegmentedControl";
import type { Asset, MediaState } from "@/lib/studioModel";

export type FirstPostMode = "none" | "media" | "carousel";

export interface FirstPostMediaProps {
  /** The thread draft the media belongs to. */
  draftId: string;
  /** The thread's first post carries this topic's carousel. */
  carouselOn: boolean;
  /** The topic has a carousel that could be carried. */
  hasCarousel: boolean;
  /** Public URLs of that carousel's slide images, in order (the same images its Instagram post uses). */
  carouselImages: string[];
  /** The carousel's images drawn and checked, so the first post can go out. */
  carouselReady: boolean;
  /** Put the carousel on the first post, or take it off. */
  onCarousel: (on: boolean) => void;
  /** Show the Instagram column's Carousel tab, where the slides and images are edited. */
  onOpenCarousel: () => void;
  /** The photo or video attached to the first post, if any. */
  asset: Asset | undefined;
  mediaState: MediaState;
  media: MediaActions;
  /** Open the library picker for the photo or video. */
  onAttach: () => void;
  error?: string | null;
}

const MODES: { value: FirstPostMode; label: string }[] = [
  { value: "none", label: "Text only" },
  { value: "media", label: "Photo or video" },
  { value: "carousel", label: "Carousel" },
];

/**
 * What the thread's first post carries: nothing, one photo or video, or this topic's carousel. The first post's own
 * text is the caption and the rest of the thread follows as replies, so a carousel needs no text of its own. The
 * images stay on the carousel (one set, edited in its tab); the thread only points at it.
 */
export default function FirstPostMedia(p: FirstPostMediaProps) {
  // "Photo or video" can be chosen before a file is attached, so the choice is kept here until then.
  const [picked, setPicked] = useState<FirstPostMode | null>(null);
  const mode: FirstPostMode = p.carouselOn ? "carousel" : p.mediaState !== "none" ? "media" : (picked ?? "none");

  function choose(next: FirstPostMode) {
    setPicked(next);
    if (next === "carousel") {
      if (!p.carouselOn) p.onCarousel(true);
      return;
    }
    if (p.carouselOn) p.onCarousel(false);
    if (next === "none" && p.mediaState !== "none") void p.media.attach(p.draftId, null);
  }

  return (
    <div className="studio-fpm" role="group" aria-label="What the first post carries">
      <div className="studio-fpm-head">
        <span className="t-meta">FIRST POST CARRIES</span>
        <SegmentedControl<FirstPostMode> label="First post media" value={mode} onChange={choose} options={MODES} />
      </div>
      {!p.hasCarousel && mode !== "carousel" && (
        <p className="t-meta studio-muted">
          NO CAROUSEL YET · WRITE ONE IN THE INSTAGRAM COLUMN TO PUT IT ON THE FIRST POST
        </p>
      )}
      {mode === "media" && (
        <MediaPanel
          kind="threads"
          draftId={p.draftId}
          asset={p.asset}
          state={p.mediaState}
          media={p.media}
          onAttach={p.onAttach}
        />
      )}
      {mode === "carousel" && (
        <div className="studio-fpm-carousel">
          {p.carouselImages.length > 0 ? (
            <ul className="studio-th-strip" aria-label={`The ${p.carouselImages.length} images on the first post`}>
              {p.carouselImages.map((src, i) => (
                <li key={`${src}-${i}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Slide ${i + 1}`} width={48} height={60} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-meta studio-muted">THE SLIDES ARE NOT DRAWN YET</p>
          )}
          <p className="t-meta studio-muted">
            The first post is the caption; the rest of the thread follows as replies. These are the same images as the
            Instagram carousel.{" "}
            <button type="button" className="studio-linkbtn" onClick={p.onOpenCarousel}>
              {p.carouselReady ? "Edit them in its Carousel tab" : "Draw them in its Carousel tab"}
            </button>
          </p>
        </div>
      )}
      {p.error && (
        <p className="studio-inline-error" role="alert">
          {p.error}
        </p>
      )}
    </div>
  );
}
