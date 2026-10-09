import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("convex/react", () => ({ useMutation: () => vi.fn(), useQuery: () => undefined, useAction: () => vi.fn() }));

import FirstPostMedia, { type FirstPostMediaProps } from "@/components/features/studio/FirstPostMedia";
import ThreadsColumn from "@/components/features/studio/ThreadsColumn";
import type { DraftView, GenState } from "@/components/features/studio/types";
import type { MediaActions } from "@/components/features/studio/useMediaActions";
import type { Asset, Draft, Readiness } from "@/lib/studioModel";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const idle: GenState = { writing: false, error: null, elapsed: "0:00", onRetry: vi.fn(), retrying: false };
const ready: Readiness = { state: "ready", overBy: 0, reason: "" };
const media: MediaActions = { busy: null, error: null, clearError: vi.fn(), attach: vi.fn(), verify: vi.fn() };
const view = (body: string): DraftView => ({
  draft: { _id: "d1", templateVersion: 1 } as unknown as Draft,
  body,
  onChange: vi.fn(),
  onBlur: vi.fn(),
});
const photo = { _id: "m1", mimeType: "image/jpeg", publicUrl: "https://x.test/a.jpg", verifiedAt: Date.now(), filename: "photo.jpg" } as unknown as Asset;

const props = (over: Partial<FirstPostMediaProps> = {}): FirstPostMediaProps => ({
  draftId: "d1",
  carouselOn: false,
  hasCarousel: true,
  carouselImages: ["https://x.test/1.png", "https://x.test/2.png"],
  carouselReady: true,
  onCarousel: vi.fn(),
  onOpenCarousel: vi.fn(),
  asset: undefined,
  mediaState: "none",
  media,
  onAttach: vi.fn(),
  ...over,
});

describe("FirstPostMedia", () => {
  it("offers text only, a photo or video, or the carousel, starting on text only", () => {
    const out = html(<FirstPostMedia {...props()} />);
    expect(out).toContain("FIRST POST CARRIES");
    expect(out).toContain(">Text only<");
    expect(out).toContain(">Photo or video<");
    expect(out).toContain(">Carousel<");
    expect(out).toMatch(/aria-pressed="true"[^>]*>Text only</);
    expect(out).not.toContain("<img");
    expect(out).not.toContain("OPTIONAL · FIRST POST ONLY");
  });

  it("with the carousel on: shows its images, says the first post is the caption, and links to the slides", () => {
    const out = html(<FirstPostMedia {...props({ carouselOn: true })} />);
    expect(out).toMatch(/aria-pressed="true"[^>]*>Carousel</);
    expect(out.match(/<img/g)).toHaveLength(2);
    expect(out).toContain("The first post is the caption");
    expect(out).toContain("the rest of the thread follows as replies");
    expect(out).toContain("Edit them in its Carousel tab");
    expect(out).not.toContain("NO CAROUSEL YET");
  });

  it("with the slides not drawn yet says so and points at the Carousel tab", () => {
    const out = html(<FirstPostMedia {...props({ carouselOn: true, carouselImages: [], carouselReady: false })} />);
    expect(out).toContain("THE SLIDES ARE NOT DRAWN YET");
    expect(out).toContain("Draw them in its Carousel tab");
  });

  it("says when there is no carousel to carry, and does not pretend", () => {
    const out = html(<FirstPostMedia {...props({ hasCarousel: false, carouselImages: [] })} />);
    expect(out).toContain("NO CAROUSEL YET");
  });

  it("with a photo attached shows it as the media, ready for Threads, and a text-only thread has no media row", () => {
    const withPhoto = html(<FirstPostMedia {...props({ asset: photo, mediaState: "ok" })} />);
    expect(withPhoto).toMatch(/aria-pressed="true"[^>]*>Photo or video</);
    expect(withPhoto).toContain("READY FOR THREADS");
    expect(withPhoto).toContain("Detach");
    expect(html(<FirstPostMedia {...props()} />)).not.toContain("READY FOR THREADS");
  });

  it("shows why the first post could not be changed", () => {
    expect(html(<FirstPostMedia {...props({ error: "This thread already has a post." })} />)).toContain('role="alert"');
  });
});

describe("ThreadsColumn with the first post's media", () => {
  const column = (over: Partial<Parameters<typeof ThreadsColumn>[0]> = {}) =>
    html(<ThreadsColumn view={view("One.\n---\nTwo.")} readiness={ready} gen={idle} placeholders={[]} emptyCopy="x" firstPostMedia={props()} {...over} />);

  it("shows it under a written thread, and there are no Thread / Carousel tabs", () => {
    const out = column();
    expect(out).toContain("FIRST POST CARRIES");
    expect(out).not.toContain('aria-label="Threads post"');
    expect(out).not.toContain("THREADS TEXT");
  });

  it("does not show it once the thread is queued, or when there is nothing written", () => {
    expect(column({ readiness: { state: "queued", overBy: 0, reason: "" } })).not.toContain("FIRST POST CARRIES");
    expect(column({ view: undefined })).not.toContain("FIRST POST CARRIES");
  });

  it("is absent when the page does not pass it", () => {
    expect(column({ firstPostMedia: undefined })).not.toContain("FIRST POST CARRIES");
  });
});
