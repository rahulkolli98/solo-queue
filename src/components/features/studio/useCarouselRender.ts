"use client";

import { useAction, useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type { Slide } from "../../../../convex/lib/carouselSlides";
import { drawSlide } from "@/lib/carouselEditor";
import { studioErrorText } from "@/lib/studioErrors";

export type RenderState = "idle" | "rendering" | "attaching" | "done" | "error";

export interface RenderProgress {
  /** "drawing" while the route draws each slide, "saving" while the images are uploaded and checked. */
  phase: "drawing" | "saving";
  done: number;
  total: number;
}

/** Everything `renderCarousel` needs from the outside, so a test can hand it fakes. */
export interface RenderDeps {
  fetch: typeof fetch;
  generateUploadUrl: () => Promise<string>;
  /** POST the PNG to the upload URL; resolves with the storage id. */
  upload: (url: string, blob: Blob) => Promise<string>;
  /** media.store: resolves with the new media asset id. */
  store: (args: { storageId: string; mimeType: string; filename: string }) => Promise<string>;
  /** media.verify: throws when the image is not reachable. */
  verify: (id: string) => Promise<unknown>;
  /** drafts.attachCarouselMedia with every id in slide order. */
  attach: (ids: string[]) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  /** drafts.update for the caption, called first and only when a caption is given. */
  saveCaption?: (caption: string) => Promise<unknown>;
  onProgress?: (progress: RenderProgress) => void;
  signal?: AbortSignal;
}

export interface RenderInput {
  draftId: string;
  slides: readonly Slide[];
  /** The images the draft has now: removed (best effort) once the new ones are attached. */
  previousIds?: readonly string[];
  caption?: string;
}

export type RenderStep = "caption" | "draw" | "upload" | "verify" | "attach";

/** A failed step, with a sentence the founder can read. Whatever the draft had attached is untouched. */
export class CarouselRenderError extends Error {
  readonly step: RenderStep;
  readonly slide?: number;
  constructor(step: RenderStep, message: string, slide?: number) {
    super(message);
    this.name = "CarouselRenderError";
    this.step = step;
    this.slide = slide;
  }
}

/** How many slides are drawn, or uploaded and checked, at the same time. */
export const RENDER_PARALLEL = 2;

const pad = (n: number) => String(n).padStart(2, "0");

export function slideFilename(draftId: string, index: number): string {
  return `carousel-${draftId}-slide-${pad(index + 1)}.png`;
}

/** The PNG POSTed to the Convex upload URL; resolves with its storage id. */
export async function uploadBlob(fetchFn: typeof fetch, url: string, blob: Blob): Promise<string> {
  let res: Response;
  try {
    res = await fetchFn(url, { method: "POST", headers: { "Content-Type": blob.type || "image/png" }, body: blob });
  } catch {
    throw new Error("Upload failed. Check your connection and try again.");
  }
  if (!res.ok) throw new Error("Upload failed. Try again.");
  const body = (await res.json().catch(() => null)) as { storageId?: unknown } | null;
  if (!body || typeof body.storageId !== "string" || !body.storageId) throw new Error("Upload failed. Try again.");
  return body.storageId;
}

/**
 * Run `fn` over the items, `limit` at a time, results in item order. After a failure nothing new starts; the
 * jobs already running finish first (so the caller knows what they stored), then the first error is thrown.
 */
async function pool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failure: { error: unknown } | null = null;
  const worker = async () => {
    while (!failure && next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure) throw (failure as { error: unknown }).error;
  return results;
}

/**
 * Draw every slide, store the images, check each is reachable, then attach them all in order.
 *
 *  1. The caption is saved first when one is given.
 *  2. Every slide is drawn through the image route (2 at a time). A 400 or 500 stops here: nothing is uploaded.
 *  3. Each PNG is uploaded, stored in the library (`carousel-<draft>-slide-01.png` ...) and verified.
 *  4. `attach` gets every id in slide order. A failure in step 3 or 4 removes the images just stored (best
 *     effort) and leaves the draft's current images as they were.
 *  5. Only after a successful attach are the draft's previous images removed (failures ignored).
 *
 * Resolves with the new ids in slide order. Rejects with a CarouselRenderError.
 */
export async function renderCarousel(deps: RenderDeps, input: RenderInput): Promise<string[]> {
  const { slides } = input;
  const total = slides.length;
  const stopIfAborted = () => {
    if (deps.signal?.aborted) throw new CarouselRenderError("draw", "Drawing was cancelled.");
  };
  const progress = (phase: RenderProgress["phase"], done: number) => deps.onProgress?.({ phase, done, total });

  if (input.caption !== undefined && deps.saveCaption) {
    try {
      await deps.saveCaption(input.caption);
    } catch (e) {
      throw new CarouselRenderError("caption", `Couldn't save the caption. ${studioErrorText(e, "Try again.")}`);
    }
  }

  let drawn = 0;
  progress("drawing", 0);
  const blobs = await pool(slides, RENDER_PARALLEL, async (slide, i) => {
    stopIfAborted();
    try {
      const blob = await drawSlide(deps.fetch, slide, i, total, deps.signal);
      drawn += 1;
      progress("drawing", drawn);
      return blob;
    } catch (e) {
      throw new CarouselRenderError(
        "draw",
        `Slide ${i + 1} couldn't be drawn: ${studioErrorText(e, "Try again.")}`,
        i + 1
      );
    }
  });

  const ids: (string | undefined)[] = new Array(total).fill(undefined);
  const stored = () => ids.filter((id): id is string => typeof id === "string");
  let saved = 0;
  progress("saving", 0);
  try {
    await pool(blobs, RENDER_PARALLEL, async (blob, i) => {
      stopIfAborted();
      try {
        const url = await deps.generateUploadUrl();
        const storageId = await deps.upload(url, blob);
        ids[i] = await deps.store({ storageId, mimeType: "image/png", filename: slideFilename(input.draftId, i) });
      } catch (e) {
        throw new CarouselRenderError(
          "upload",
          `Slide ${i + 1} couldn't be saved: ${studioErrorText(e, "Upload failed. Try again.")}`,
          i + 1
        );
      }
      try {
        await deps.verify(ids[i] as string);
      } catch (e) {
        throw new CarouselRenderError(
          "verify",
          `Slide ${i + 1}'s image isn't reachable: ${studioErrorText(e, "Try again.")}`,
          i + 1
        );
      }
      saved += 1;
      progress("saving", saved);
    });
    stopIfAborted();
    try {
      await deps.attach(stored());
    } catch (e) {
      throw new CarouselRenderError("attach", studioErrorText(e, "Couldn't attach the slide images. Try again."));
    }
  } catch (e) {
    await Promise.allSettled(stored().map((id) => deps.remove(id)));
    throw e;
  }

  const keep = new Set(stored());
  await Promise.allSettled((input.previousIds ?? []).filter((id) => !keep.has(id)).map((id) => deps.remove(id)));
  return stored();
}

/**
 * The carousel's "Draw the slides" flow as state for a component. The sequencing lives in `renderCarousel`;
 * this only wires it to Convex and to React state. `deps` replaces any of the real calls (tests, previews).
 */
export function useCarouselRender({
  draft,
  deps: override,
}: {
  draft: Doc<"drafts"> | undefined;
  deps?: Partial<RenderDeps>;
}): {
  state: RenderState;
  progress: { done: number; total: number };
  error: string | null;
  render: (slides: readonly Slide[], caption?: string) => Promise<boolean>;
  /** Remove library images that no draft uses any more (best effort, failures are ignored). */
  discardImages: (ids: readonly string[]) => Promise<void>;
  reset: () => void;
} {
  const generateUploadUrl = useMutation(api.media.generateUploadUrl);
  const store = useMutation(api.media.store);
  const verify = useAction(api.media.verify);
  const attach = useMutation(api.drafts.attachCarouselMedia);
  const remove = useMutation(api.media.remove);
  const update = useMutation(api.drafts.update);

  const [state, setState] = useState<RenderState>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const alive = useRef(true);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abort.current?.abort();
    };
  }, []);

  const draftId = draft?._id;
  const draftBody = draft?.body;
  const previous = draft?.mediaAssetIds;
  const overrideRef = useRef(override);
  useEffect(() => {
    overrideRef.current = override;
  });

  const render = useCallback(
    async (slides: readonly Slide[], caption?: string): Promise<boolean> => {
      if (!draftId || running.current) return false;
      running.current = true;
      const controller = new AbortController();
      abort.current = controller;
      setError(null);
      setState("rendering");
      setProgress({ done: 0, total: slides.length });
      const deps: RenderDeps = {
        fetch: (...args) => fetch(...args),
        generateUploadUrl: () => generateUploadUrl(),
        upload: (url, blob) => uploadBlob((...args) => fetch(...args), url, blob),
        store: (args) => store({ ...args, storageId: args.storageId as Id<"_storage"> }),
        verify: (id) => verify({ id: id as Id<"mediaAssets"> }),
        attach: (ids) => attach({ id: draftId, mediaAssetIds: ids as Id<"mediaAssets">[] }),
        remove: (id) => remove({ id: id as Id<"mediaAssets"> }),
        saveCaption: (text) => (text.trim() && text !== draftBody ? update({ id: draftId, body: text }) : Promise.resolve()),
        signal: controller.signal,
        ...overrideRef.current,
        onProgress: (p) => {
          if (!alive.current) return;
          setState(p.phase === "drawing" ? "rendering" : "attaching");
          setProgress({ done: p.done, total: p.total });
          overrideRef.current?.onProgress?.(p);
        },
      };
      try {
        await renderCarousel(deps, { draftId, slides, previousIds: previous ?? [], caption });
        if (alive.current) setState("done");
        return true;
      } catch (e) {
        if (alive.current) {
          setError(
            e instanceof CarouselRenderError ? e.message : studioErrorText(e, "Couldn't draw the slides. Try again.")
          );
          setState("error");
        }
        return false;
      } finally {
        running.current = false;
      }
    },
    [draftId, draftBody, previous, generateUploadUrl, store, verify, attach, remove, update]
  );

  const discardImages = useCallback(
    async (ids: readonly string[]) => {
      await Promise.allSettled(ids.map((id) => remove({ id: id as Id<"mediaAssets"> })));
    },
    [remove]
  );

  const reset = useCallback(() => {
    setState("idle");
    setError(null);
  }, []);

  return useMemo(
    () => ({ state, progress, error, render, discardImages, reset }),
    [state, progress, error, render, discardImages, reset]
  );
}
