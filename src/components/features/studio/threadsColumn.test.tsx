import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("convex/react", () => ({ useMutation: () => vi.fn(), useQuery: () => undefined, useAction: () => vi.fn() }));

import MediaPanel from "@/components/features/studio/MediaPanel";
import ThreadsCarouselView, { type ThreadsCarouselProps } from "@/components/features/studio/ThreadsCarouselView";
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
const asset = (over: Partial<Asset> = {}) => ({ _id: "m1", mimeType: "image/jpeg", publicUrl: "https://x.test/a.jpg", verifiedAt: Date.now(), filename: "photo.jpg", ...over }) as unknown as Asset;

const carousel = (over: Partial<ThreadsCarouselProps> = {}): ThreadsCarouselProps => ({
  view: view("Words for Threads."),
  readiness: ready,
  images: ["https://x.test/1.png", "https://x.test/2.png"],
  writing: false,
  error: null,
  busy: false,
  onWrite: vi.fn(),
  onWriteMyself: vi.fn(),
  onRemove: vi.fn(),
  onOpenCarousel: vi.fn(),
  ...over,
});

describe("ThreadsCarouselView", () => {
  it("shows the text with its count, the shared images, and how to change them", () => {
    const out = html(<ThreadsCarouselView {...carousel()} />);
    expect(out).toContain("THREADS TEXT · 18 / 500");
    expect(out).toContain('aria-label="Threads text for the carousel"');
    expect(out).toContain("Words for Threads.");
    expect(out.match(/<img/g)).toHaveLength(2);
    expect(out).toContain("The same images as the Instagram carousel");
    expect(out).toContain("Edit them in its Carousel tab");
    expect(out).toContain("Rewrite text");
    expect(out).toContain("Take off Threads");
  });

  it("says over by N when the text is past 500, and that an empty text posts the images only", () => {
    expect(html(<ThreadsCarouselView {...carousel({ view: view("x".repeat(512)) })} />)).toContain("OVER BY 12");
    expect(html(<ThreadsCarouselView {...carousel({ view: view("") })} />)).toContain("EMPTY: POSTS THE IMAGES ONLY");
  });

  it("for a carousel that is not going to Threads offers to write the text, or to write it yourself", () => {
    const out = html(<ThreadsCarouselView {...carousel({ view: undefined })} />);
    expect(out).toContain("going to Instagram only");
    expect(out).toContain("Write the Threads text");
    expect(out).toContain("Write it myself");
    expect(out).not.toContain("<textarea");
  });

  it("is disabled while something is being written, shows the error, and cannot be taken off Threads once queued", () => {
    expect(html(<ThreadsCarouselView {...carousel({ view: undefined, busy: true })} />)).toMatch(/<button[^>]*disabled=""[^>]*>Write the Threads text/);
    expect(html(<ThreadsCarouselView {...carousel({ writing: true })} />)).toContain("WRITING THE THREADS TEXT");
    expect(html(<ThreadsCarouselView {...carousel({ error: "Could not write." })} />)).toContain('role="alert"');
    const queued = html(<ThreadsCarouselView {...carousel({ readiness: { state: "queued", overBy: 0, reason: "" } })} />);
    expect(queued).not.toContain("Take off Threads");
  });

  it("with no images drawn yet says where to draw them", () => {
    expect(html(<ThreadsCarouselView {...carousel({ images: [] })} />)).toContain("DRAW THE SLIDES IN THE INSTAGRAM CAROUSEL TAB");
  });
});

describe("ThreadsColumn with a carousel", () => {
  const column = (props: Partial<Parameters<typeof ThreadsColumn>[0]> = {}) =>
    html(
      <ThreadsColumn view={view("One.\n---\nTwo.")} readiness={ready} gen={idle} placeholders={[]} emptyCopy="x" {...props} />
    );

  it("has no Thread / Carousel switch for a topic without a carousel", () => {
    expect(column()).not.toContain('aria-label="Threads post"');
  });

  it("has the switch when the topic has a carousel, opening on the thread", () => {
    const out = column({ carousel: carousel() });
    expect(out).toContain('aria-label="Threads post"');
    expect(out).toContain(">Thread<");
    expect(out).toContain(">Carousel<");
    expect(out).toContain("2-POST THREAD");
    expect(out).not.toContain("THREADS TEXT");
  });
});

describe("media on a thread", () => {
  it("is offered as optional, for the first post only, when nothing is attached", () => {
    const out = html(<MediaPanel kind="threads" draftId="d1" asset={undefined} state="none" media={media} onAttach={vi.fn()} />);
    expect(out).toContain("Photo or video");
    expect(out).toContain("OPTIONAL · FIRST POST ONLY");
    expect(out).toContain("Add media");
    expect(out).not.toContain("MEDIA REQUIRED");
  });

  it("an attached file reads ready for Threads, and a missing one says how to carry on", () => {
    const ok = html(<MediaPanel kind="threads" draftId="d1" asset={asset()} state="ok" media={media} onAttach={vi.fn()} />);
    expect(ok).toContain("READY FOR THREADS");
    expect(ok).not.toContain("READY FOR INSTAGRAM");
    expect(ok).toContain("Detach");
    const gone = html(<MediaPanel kind="threads" draftId="d1" asset={undefined} state="missing" media={media} onAttach={vi.fn()} />);
    expect(gone).toContain("detach it to post the thread as text");
  });

  it("an Instagram caption still reads READY FOR INSTAGRAM and still requires media", () => {
    expect(html(<MediaPanel kind="caption" draftId="d1" asset={asset()} state="ok" media={media} onAttach={vi.fn()} />)).toContain("READY FOR INSTAGRAM");
    const need = html(<MediaPanel kind="caption" draftId="d1" asset={undefined} state="none" media={media} onAttach={vi.fn()} />);
    expect(need).toContain("MEDIA REQUIRED");
  });

  it("shows under a written thread that is not queued, and not once it is queued", () => {
    const threadMedia = { asset: undefined, state: "none" as const, media, onAttach: vi.fn() };
    const open = html(<ThreadsColumn view={view("One.")} readiness={ready} gen={idle} placeholders={[]} emptyCopy="x" threadMedia={threadMedia} />);
    expect(open).toContain("OPTIONAL · FIRST POST ONLY");
    const queued = html(
      <ThreadsColumn view={view("One.")} readiness={{ state: "queued", overBy: 0, reason: "" }} gen={idle} placeholders={[]} emptyCopy="x" threadMedia={threadMedia} />
    );
    expect(queued).not.toContain("OPTIONAL · FIRST POST ONLY");
  });
});
