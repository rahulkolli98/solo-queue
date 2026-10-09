"use client";

import { useEffect, useState } from "react";
import type { Slide } from "../../../../convex/lib/carouselSlides";
import { SLIDE_HEIGHT, SLIDE_WIDTH } from "../../../../convex/lib/carouselSlides";
import { drawSlide, slideIssues, slideKey } from "@/lib/carouselEditor";
import { errorText } from "@/lib/errors";

/** How long the slide text must stay unchanged before it is sent to the image route. */
export const PREVIEW_DEBOUNCE_MS = 600;
/** Slides the route is asked to draw at once, across every preview on the page. */
const MAX_PARALLEL = 3;
/** Drawn slides kept for reuse (nothing on screen counts against this). */
const MAX_IDLE = 40;

/* One blob URL per drawn slide, shared by every preview on the page, so selecting a slide whose thumbnail is
   already drawn shows it at once. A URL is revoked only once no preview uses it and the cache is over its limit. */
const urls = new Map<string, string>();
const holds = new Map<string, number>();

function remember(key: string, url: string) {
  urls.set(key, url);
  const idle = [...urls.keys()].filter((k) => !holds.get(k));
  while (idle.length > MAX_IDLE) {
    const oldest = idle.shift() as string;
    URL.revokeObjectURL(urls.get(oldest) as string);
    urls.delete(oldest);
  }
}
function hold(key: string) {
  holds.set(key, (holds.get(key) ?? 0) + 1);
}
function drop(key: string) {
  const left = (holds.get(key) ?? 1) - 1;
  if (left > 0) holds.set(key, left);
  else holds.delete(key);
}

/* A small queue so ten thumbnails do not ask the server for ten images in the same instant. */
let active = 0;
const waiting: Array<() => void> = [];
const abortError = () => new DOMException("Aborted", "AbortError");

function acquire(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());
  if (active < MAX_PARALLEL) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const entry = () => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = () => {
      waiting.splice(waiting.indexOf(entry), 1);
      reject(abortError());
    };
    waiting.push(entry);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
function release() {
  const next = waiting.shift();
  if (next) next();
  else active -= 1;
}

/**
 * One carousel slide, drawn by the image route: the slide JSON is POSTed to /api/carousel/slide a moment after it
 * stops changing (a stale request is aborted), and the PNG is shown at 1080 x 1350 scaled down by CSS. While a new
 * version is being drawn the last one stays on screen, dimmed; a slide that cannot be drawn says why in one line.
 */
export default function SlidePreview({
  slide,
  index,
  total,
  decorative = false,
  className,
  theme,
}: {
  slide: Slide;
  /** The design the slide is drawn in (themes.ts); missing is Solo Queue. */
  theme?: string;
  /** 0-based position in the carousel (the route prints it as "03/06"). */
  index: number;
  total: number;
  /** The preview sits inside a control that already has a name: the image gets empty alt text. */
  decorative?: boolean;
  className?: string;
}) {
  const key = slideKey(slide, index, total, theme);
  const problems = slideIssues(slide);
  const invalid = problems.length > 0;
  const cached = urls.get(key);
  const [last, setLast] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ key: string; error: string } | null>(null);

  useEffect(() => {
    if (invalid) return;
    if (urls.has(key)) {
      hold(key);
      return () => drop(key);
    }
    const [payload, at, count, chosen] = JSON.parse(key) as [Slide, number, number, string];
    const controller = new AbortController();
    let held = false;
    const timer = setTimeout(async () => {
      try {
        await acquire(controller.signal);
        let blob: Blob;
        try {
          blob = await drawSlide((...args) => fetch(...args), payload, at, count, controller.signal, chosen);
        } finally {
          release();
        }
        if (controller.signal.aborted) return;
        const url = urls.get(key) ?? URL.createObjectURL(blob);
        remember(key, url);
        hold(key);
        held = true;
        setLast(url);
        setFailure(null);
      } catch (e) {
        if (controller.signal.aborted || (e instanceof Error && e.name === "AbortError")) return;
        setFailure({ key, error: errorText(e, "Try again.") });
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (held) drop(key);
    };
  }, [key, invalid]);

  const url = invalid ? null : (cached ?? last);
  const error = invalid ? problems[0] : failure?.key === key ? failure.error : null;
  const pending = !invalid && !error && !cached;
  const alt = decorative ? "" : slide.headline.replace(/\s+/g, " ").trim() || `Slide ${index + 1}`;

  return (
    <div className={`studio-cr-preview${className ? ` ${className}` : ""}`} aria-busy={pending || undefined} data-pending={pending || undefined}>
      {error ? (
        <p className="studio-cr-preview-note" role={invalid ? undefined : "alert"}>
          Couldn&apos;t draw this slide: {error}
        </p>
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a blob URL for a PNG the server just drew
        <img src={url} alt={alt} width={SLIDE_WIDTH} height={SLIDE_HEIGHT} draggable={false} className="studio-cr-preview-img" />
      ) : (
        <span className="sq-sk studio-cr-preview-skeleton" aria-hidden="true" />
      )}
      {pending && (
        <span className="studio-cr-preview-note studio-cr-preview-drawing" role="status">
          Drawing…
        </span>
      )}
    </div>
  );
}
