import { renderToStaticMarkup } from "react-dom/server";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi, type Mock } from "vitest";

const hooks = vi.hoisted(() => ({ assets: undefined as unknown[] | undefined }));

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
  useQuery: () => hooks.assets,
}));

import type { Doc } from "../../../../convex/_generated/dataModel";
import { MAX_SLIDES, MIN_SLIDES, type Slide } from "../../../../convex/lib/carouselSlides";
import CarouselPanel from "@/components/features/studio/CarouselPanel";
import type { GenState } from "@/components/features/studio/types";
import {
  CarouselRenderError,
  renderCarousel,
  slideFilename,
  type RenderDeps,
  type RenderProgress,
} from "@/components/features/studio/useCarouselRender";

const idle: GenState = { writing: false, error: null, elapsed: "0:00", onRetry: vi.fn(), retrying: false };
const html = (node: React.ReactElement) => renderToStaticMarkup(node);

const slide = (over: Partial<Slide> = {}): Slide => ({ layout: "cards", tone: "cream", headline: "A headline", ...over });
const slides = (n: number): Slide[] =>
  Array.from({ length: n }, (_, i) => slide({ headline: `Slide number ${i + 1}`, layout: i === 0 ? "cover" : "cards" }));

function draft(over: Record<string, unknown> = {}, count = 3): Doc<"drafts"> {
  return { _id: "d1", body: "A caption", templateVersion: 1, slides: slides(count), ...over } as unknown as Doc<"drafts">;
}
const panel = (d: Doc<"drafts"> | undefined, gen: Partial<GenState> = {}, props: { bannedWords?: string[] } = {}) =>
  html(<CarouselPanel topicId="t1" draft={d} gen={{ ...idle, ...gen }} onWrite={vi.fn()} {...props} />);

const button = (out: string, text: string) => new RegExp(`<button[^>]*>${text}</button>`).exec(out)?.[0] ?? "";

describe("CarouselPanel with no draft", () => {
  it("explains the carousel and offers Write the carousel", () => {
    const out = panel(undefined);
    expect(out).toContain(`A carousel is ${MIN_SLIDES} to ${MAX_SLIDES} slides`);
    expect(out).toContain("tick Carousel in the setup line and Generate.");
    const write = button(out, "Write the carousel");
    expect(write).not.toBe("");
    expect(write).not.toContain("disabled");
  });

  it("disables the button and shows a skeleton while it is writing", () => {
    const out = panel(undefined, { writing: true, elapsed: "0:12" });
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain("WRITING THE CAROUSEL… 0:12");
    expect(button(out, "Writing the carousel…")).toContain('disabled=""');
  });

  it("shows the error card with Retry when the write failed", () => {
    const out = panel(undefined, { error: "The model said no.", errorCode: "LLM_RATE_LIMIT" });
    expect(out).toContain('role="alert"');
    expect(out).toContain("Couldn&#x27;t write the carousel");
    expect(out).toContain("The model said no.");
    expect(out).toContain("Wait a minute, then press Retry.");
    expect(out).toContain(">Retry<");
    expect(out).not.toContain("write it yourself");
  });
});

describe("CarouselPanel with slides", () => {
  const out = panel(draft());

  it("shows a labelled filmstrip with the first slide current", () => {
    expect(out).toContain('aria-label="Slides"');
    expect(out).toContain("Slide 1 of 3: Slide number 1");
    expect(out).toContain("Slide 3 of 3: Slide number 3");
    expect(out.match(/aria-current="true"/g)).toHaveLength(1);
    expect(out).toMatch(/aria-current="true"[^>]*aria-label="Slide 1 of 3/);
  });

  it("labels every field of the selected slide", () => {
    for (const label of ["Layout", "Colour", "Kicker", "Headline", "Accent word", "Italic line"]) {
      expect(out).toMatch(new RegExp(`<label[^>]*>${label}</label>`));
    }
    expect(out).toContain("Use Enter for a line break.");
    expect(out).toContain("Instagram caption");
  });

  it("lists every layout, statement included, and every colour", () => {
    for (const layout of ["Cover", "Cards", "List", "Close", "Statement"]) expect(out).toContain(`>${layout}</option>`);
    for (const tone of ["Coral", "Cream", "Ink", "Pink", "Yellow", "Blue"]) expect(out).toContain(`>${tone}</option>`);
  });

  it("has Move left / Move right / Add slide after / Remove slide, with Move left off on the first slide", () => {
    expect(button(out, "Move left")).toContain('disabled=""');
    expect(button(out, "Move right")).not.toContain("disabled");
    expect(button(out, "Add slide after")).not.toContain("disabled");
    expect(button(out, "Remove slide")).not.toContain("disabled");
    expect(out).toContain("3 / 10 SLIDES");
  });

  it("shows the Draw the slides button, no attached notice and no download links", () => {
    expect(out).toContain(">Draw the slides<");
    expect(out).toContain("No slide images yet.");
    expect(out).not.toContain("Editing slides removes the drawn images");
    expect(out).not.toContain("DOWNLOAD ALL");
    expect(out).not.toContain("Save slides");
  });

  it("shows the caption with its count", () => {
    expect(out).toContain("CAPTION · 9 / 2,200");
    expect(out).not.toContain("OVER BY");
  });

  it("shows the cards controls on a cards slide, and the card limit", () => {
    const cards = panel(draft({ slides: [slide({ cards: [{ text: "One", tone: "ink" }] }), slide()] }));
    const cardsFirst = cards.indexOf("Add card");
    expect(cardsFirst).toBeGreaterThan(-1);
    expect(cards).toContain("1 / 3 CARDS");
    expect(cards).toContain('aria-label="Remove card 1"');
    expect(cards).toContain(">Card text<");
    const full = panel(
      draft({ slides: [slide({ cards: [1, 2, 3].map((n) => ({ text: `c${n}`, tone: "ink" })) }), slide()] })
    );
    expect(button(full, "Add card")).toContain('disabled=""');
  });

  it("shows pills on a close slide and items on a list slide", () => {
    expect(panel(draft({ slides: [slide({ layout: "close", pills: ["Follow", "Save"] }), slide()] }))).toContain("2 / 3 PILLS");
    expect(panel(draft({ slides: [slide({ layout: "list", items: [{ text: "one" }] }), slide()] }))).toContain("1 / 5 ITEMS");
  });

  it("shows a character count once a field is near its limit, and flags one over it", () => {
    const near = panel(draft({ slides: [slide({ kicker: "k".repeat(35) }), slide()] }));
    expect(near).toContain("35 / 40");
    const over = panel(draft({ slides: [slide({ kicker: "k".repeat(45) }), slide()] }));
    expect(over).toContain("45 / 40");
    expect(over).toContain('data-over="true"');
    expect(over).toContain("Kicker is over 40 characters.");
    expect(over).toContain("Fix slide 1 before saving or drawing.");
    expect(button(over, "Draw the slides")).toContain('disabled=""');
    expect(over).toContain("Has a problem.");
  });

  it("explains an accent word that is not in the headline", () => {
    const out2 = panel(draft({ slides: [slide({ accent: "missing" }), slide()] }));
    expect(out2).toContain("not in the headline");
  });

  it("a statement slide has a Tag field and a single slide cannot be removed", () => {
    const one = panel(draft({ slides: [slide({ layout: "statement", tag: "Build in public" })] }, 1));
    expect(one).toMatch(/<label[^>]*>Tag<\/label>/);
    expect(one).toContain("SINGLE SLIDE POST");
    expect(button(one, "Remove slide")).toContain('disabled=""');
    expect(button(one, "Move left")).toContain('disabled=""');
    expect(button(one, "Move right")).toContain('disabled=""');
  });

  it("disables Add slide after at the top limit and Remove slide at the bottom limit", () => {
    expect(button(panel(draft({}, MAX_SLIDES)), "Add slide after")).toContain('disabled=""');
    expect(button(panel(draft({}, MIN_SLIDES)), "Remove slide")).toContain('disabled=""');
  });

  it("shows a skeleton instead of the slides while the carousel is being rewritten", () => {
    const writing = panel(draft(), { writing: true });
    expect(writing).toContain("WRITING THE CAROUSEL");
    expect(writing).not.toContain("Instagram caption");
  });
});

describe("the caption", () => {
  it("warns when it is over 2,200 and offers Trim to fit", () => {
    const out = panel(draft({ body: "x".repeat(2250) }));
    expect(out).toContain("CAPTION · 2,250 / 2,200");
    expect(out).toContain("OVER BY 50");
    expect(out).toContain("Trim to fit");
    expect(out).toContain("Over the limit");
    expect(out).toContain('aria-invalid="true"');
  });

  it("flags a never-use word", () => {
    expect(panel(draft({ body: "This is a game changer." }), {}, { bannedWords: ["game changer"] })).toContain("NEVER-USE");
  });
});

describe("a carousel with its images attached", () => {
  const assets = [1, 2, 3].map((n) => ({ _id: `m${n}`, publicUrl: `https://files.example/slide-${n}.png`, filename: `carousel-d1-slide-0${n}.png` }));

  it("says how many are attached, warns that editing removes them, and links each one", () => {
    hooks.assets = assets;
    const out = panel(draft({ mediaAssetIds: ["m1", "m2", "m3"], mediaAssetId: "m1" }));
    hooks.assets = undefined;
    expect(out).toContain("3 slide images attached.");
    expect(out).toContain("Editing slides removes the drawn images. Draw the slides again.");
    expect(out).toContain("DOWNLOAD ALL");
    for (const n of [1, 2, 3]) {
      expect(out).toContain(`href="https://files.example/slide-${n}.png"`);
      expect(out).toContain(`aria-label="Download slide ${n}"`);
    }
    expect(out).toContain(">Draw the slides again<");
  });

  it("keeps the notice but waits for the links while they load", () => {
    hooks.assets = undefined;
    const out = panel(draft({ mediaAssetIds: ["m1", "m2", "m3"] }));
    expect(out).toContain("3 slide images attached.");
    expect(out).not.toContain("Download slide 1");
  });
});

/* ---------- renderCarousel ---------- */

const png = (text: string) => new Blob([text], { type: "image/png" });
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fakes(over: Partial<RenderDeps> = {}) {
  const deps = {
    // Slide 0 is the slowest to draw and to upload, so any code that keeps results in finishing order would show.
    fetch: vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { index: number };
      await wait(body.index === 0 ? 20 : 1);
      return new Response(png(`png${body.index}`), { status: 200 });
    }),
    generateUploadUrl: vi.fn(async () => "https://upload.example/u"),
    upload: vi.fn(async (_url: string, blob: Blob) => {
      const text = await blob.text();
      await wait(text === "png0" ? 20 : 1);
      return `storage-${text}`;
    }),
    store: vi.fn(async (a: { storageId: string; mimeType: string; filename: string }) => `asset-${a.storageId.slice(-1)}`),
    verify: vi.fn(async () => ({ status: 200 })),
    attach: vi.fn(async () => null),
    remove: vi.fn(async () => null),
    ...over,
  };
  return deps as unknown as RenderDeps & Record<"fetch" | "generateUploadUrl" | "upload" | "store" | "verify" | "attach" | "remove", Mock>;
}
const input = (over: Record<string, unknown> = {}) => ({ draftId: "d1", slides: slides(4), previousIds: ["old1", "old2"], ...over });

describe("renderCarousel", () => {
  it("draws, stores, checks and attaches every slide, keeping the slide order", async () => {
    const deps = fakes();
    const ids = await renderCarousel(deps, input());
    expect(ids).toEqual(["asset-0", "asset-1", "asset-2", "asset-3"]);
    expect(deps.attach).toHaveBeenCalledTimes(1);
    expect(deps.attach).toHaveBeenCalledWith(["asset-0", "asset-1", "asset-2", "asset-3"]);
    expect(deps.verify.mock.calls.map((c) => (c as unknown[])[0]).sort()).toEqual(ids);
  });

  it("names the files carousel-<draft>-slide-01.png and stores them as PNG", async () => {
    const deps = fakes();
    await renderCarousel(deps, input());
    const stored = deps.store.mock.calls.map((c) => c[0]);
    expect(stored.map((s) => s.filename).sort()).toEqual([
      "carousel-d1-slide-01.png",
      "carousel-d1-slide-02.png",
      "carousel-d1-slide-03.png",
      "carousel-d1-slide-04.png",
    ]);
    expect(stored.every((s) => s.mimeType === "image/png")).toBe(true);
    expect(slideFilename("abc", 9)).toBe("carousel-abc-slide-10.png");
  });

  it("sends each slide with its position to the route", async () => {
    const deps = fakes();
    await renderCarousel(deps, input());
    const bodies = deps.fetch.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)) as { index: number; total: number });
    expect(bodies.map((b) => b.index).sort()).toEqual([0, 1, 2, 3]);
    expect(bodies.every((b) => b.total === 4)).toBe(true);
  });

  it("removes the old images only after the new ones are attached", async () => {
    const deps = fakes();
    await renderCarousel(deps, input());
    expect(deps.remove.mock.calls.map((c) => c[0]).sort()).toEqual(["old1", "old2"]);
    const attachedAt = deps.attach.mock.invocationCallOrder[0];
    for (const at of deps.remove.mock.invocationCallOrder) expect(at).toBeGreaterThan(attachedAt);
  });

  it("does not remove an old image that is also one of the new ones", async () => {
    const deps = fakes();
    await renderCarousel(deps, input({ previousIds: ["asset-1", "old"] }));
    expect(deps.remove.mock.calls.map((c) => c[0])).toEqual(["old"]);
  });

  it("ignores a failure while removing the old images", async () => {
    const deps = fakes({ remove: vi.fn(async () => Promise.reject(new Error("IN_USE"))) });
    await expect(renderCarousel(deps, input())).resolves.toHaveLength(4);
  });

  it("a 400 from the route stops before anything is uploaded", async () => {
    const deps = fakes({
      fetch: vi.fn(async (_url: unknown, init?: RequestInit) => {
        const { index } = JSON.parse(String(init?.body)) as { index: number };
        return index === 1 ? json(400, { error: "Too small: headline" }) : new Response(png("x"), { status: 200 });
      }),
    });
    const err = await renderCarousel(deps, input()).catch((e) => e);
    expect(err).toBeInstanceOf(CarouselRenderError);
    expect(err).toMatchObject({ step: "draw", slide: 2 });
    expect(err.message).toBe("Slide 2 couldn't be drawn: Too small: headline");
    expect(deps.generateUploadUrl).not.toHaveBeenCalled();
    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.attach).not.toHaveBeenCalled();
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it("an upload failure stops before attaching, keeps the old images and cleans up the new ones", async () => {
    let calls = 0;
    const deps = fakes({
      upload: vi.fn(async (_url: string, blob: Blob) => {
        calls += 1;
        if (calls === 2) throw new Error("Upload failed. Try again.");
        return `storage-${await blob.text()}`;
      }),
    });
    const err = await renderCarousel(deps, input()).catch((e) => e);
    expect(err).toMatchObject({ step: "upload" });
    expect(err.message).toMatch(/^Slide \d couldn't be saved: Upload failed\. Try again\.$/);
    expect(deps.attach).not.toHaveBeenCalled();
    const removed = deps.remove.mock.calls.map((c) => c[0]);
    expect(removed).not.toContain("old1");
    expect(removed).not.toContain("old2");
    expect(removed.length).toBe(deps.store.mock.calls.length);
  });

  it("an unreachable image stops before attaching", async () => {
    const deps = fakes({ verify: vi.fn(async () => Promise.reject(new ConvexError("URL not reachable."))) });
    const err = await renderCarousel(deps, input()).catch((e) => e);
    expect(err).toMatchObject({ step: "verify" });
    expect(err.message).toContain("image isn't reachable: URL not reachable.");
    expect(deps.attach).not.toHaveBeenCalled();
    expect(deps.remove.mock.calls.map((c) => c[0])).not.toContain("old1");
  });

  it("a refused attach says why and leaves the old images alone", async () => {
    const deps = fakes({
      attach: vi.fn(async () => Promise.reject(new ConvexError("VALIDATION:CAROUSEL_QUEUED: This carousel already has a post in the Queue."))),
    });
    const err = await renderCarousel(deps, input()).catch((e) => e);
    expect(err).toMatchObject({ step: "attach", message: "This carousel already has a post in the Queue." });
    expect(deps.remove.mock.calls.map((c) => c[0])).not.toContain("old1");
  });

  it("saves the caption first when asked, and stops if that fails", async () => {
    const deps = fakes({ saveCaption: vi.fn(async () => undefined) });
    await renderCarousel(deps, input({ caption: "New caption" }));
    expect(deps.saveCaption).toHaveBeenCalledWith("New caption");

    const failing = fakes({ saveCaption: vi.fn(async () => Promise.reject(new ConvexError("VALIDATION:EMPTY_DRAFT: A draft can't be empty."))) });
    const err = await renderCarousel(failing, input({ caption: "x" })).catch((e) => e);
    expect(err).toMatchObject({ step: "caption" });
    expect(failing.fetch).not.toHaveBeenCalled();
  });

  it("reports drawing then saving progress up to the slide count", async () => {
    const seen: RenderProgress[] = [];
    const deps = fakes({ onProgress: (p) => seen.push(p) });
    await renderCarousel(deps, input({ slides: slides(3) }));
    const drawing = seen.filter((p) => p.phase === "drawing").map((p) => p.done);
    const saving = seen.filter((p) => p.phase === "saving").map((p) => p.done);
    expect(drawing).toEqual([0, 1, 2, 3]);
    expect(saving).toEqual([0, 1, 2, 3]);
    expect(seen.every((p) => p.total === 3)).toBe(true);
    expect(seen.findIndex((p) => p.phase === "saving")).toBeGreaterThan(seen.findLastIndex((p) => p.phase === "drawing") - 1);
  });

  it("works for a single slide", async () => {
    const deps = fakes();
    const ids = await renderCarousel(deps, input({ slides: slides(1), previousIds: [] }));
    expect(ids).toEqual(["asset-0"]);
    expect(deps.attach).toHaveBeenCalledWith(["asset-0"]);
  });
});

import { OwnCarouselStart } from "@/components/features/studio/OwnCarousel";

describe("a carousel made from the founder's own images", () => {
  const own = (n = 3, over: Record<string, unknown> = {}) =>
    draft({ slideSource: "uploaded", mediaAssetIds: Array.from({ length: n }, (_, i) => `a${i}`), slides: slides(n), ...over }, n);
  const asset = (i: number, over: Record<string, unknown> = {}) => ({
    _id: `a${i}`,
    publicUrl: `https://files.example/${i}.png`,
    filename: `photo-${i}.png`,
    verifiedAt: Date.now(),
    ...over,
  });

  it("is offered from the empty carousel and from a written one", () => {
    expect(button(panel(undefined), "Use my own images")).not.toBe("");
    expect(button(panel(undefined, { writing: true }), "Use my own images")).toContain("disabled");
    expect(button(panel(draft()), "Use my own images instead")).not.toBe("");
  });

  it("shows the images in order with move and remove, not the slide editor, and never offers to draw", () => {
    hooks.assets = [asset(0), asset(1), asset(2)];
    const out = panel(own(3));
    hooks.assets = undefined;
    expect(out).toContain("YOUR OWN CAROUSEL · 3 IMAGES");
    expect(out).toContain('aria-label="Your images, in order"');
    expect(out).toContain('alt="Image 1: photo-0.png"');
    expect(out).toContain('src="https://files.example/2.png"');
    expect(out).toContain('aria-label="Move image 2 left"');
    expect(out).toContain('aria-label="Remove image 3"');
    expect(out).toContain("Add images");
    expect(out).toContain("Instagram caption");
    expect(out).not.toContain("Draw the slides");
    expect(out).not.toContain('aria-label="Slides"');
    expect(out).not.toContain("Use my own images instead");
    expect(out).toContain("3 images attached and checked.");
    // The first image cannot move left, the last cannot move right.
    expect(out).toMatch(/aria-label="Move image 1 left"[^>]*disabled/);
    expect(out).toMatch(/aria-label="Move image 3 right"[^>]*disabled/);
    expect(out).not.toMatch(/aria-label="Remove image 3"[^>]*disabled/);
  });

  it("cannot go below two images, and asks for a check when an image is unchecked or stale", () => {
    hooks.assets = [asset(0), asset(1)];
    const two = panel(own(2));
    expect(two).toMatch(/aria-label="Remove image 1"[^>]*disabled/);
    expect(two).toContain("A carousel needs at least 2 images.");
    hooks.assets = [asset(0), asset(1, { verifiedAt: undefined })];
    const unchecked = panel(own(2));
    hooks.assets = [asset(0), asset(1, { verifiedAt: Date.now() - 2 * 86_400_000 })];
    const stale = panel(own(2));
    hooks.assets = undefined;
    for (const out of [unchecked, stale]) {
      expect(out).toContain("They need a check before the carousel can be queued.");
      expect(button(out, "Check the images")).not.toBe("");
    }
  });

  it("is not shown the slide editor even when it is being written over (the skeleton stays)", () => {
    expect(panel(own(2), { writing: true, elapsed: "0:05" })).toContain('aria-busy="true"');
  });

  it("the start screen asks for images and a caption before anything can be made", () => {
    const out = html(<OwnCarouselStart topicId="t1" replacing={false} onDone={vi.fn()} onCancel={vi.fn()} />);
    expect(out).toContain("YOUR OWN CAROUSEL");
    expect(out).toContain("Choose your images");
    expect(out).toContain("2 to 10 PNG or JPEG images");
    expect(out).toContain('accept="image/png,image/jpeg"');
    expect(out).toContain("multiple");
    expect(out).toContain("Add at least 2 images.");
    expect(button(out, "Make the carousel")).toContain("disabled");
    expect(out).not.toContain("replaces the carousel you have written");
    expect(html(<OwnCarouselStart topicId="t1" replacing onDone={vi.fn()} onCancel={vi.fn()} />)).toContain(
      "This replaces the carousel you have written for this topic."
    );
  });
});
