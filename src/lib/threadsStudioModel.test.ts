import { describe, expect, it } from "vitest";
import { describeMediaStatus } from "@/lib/mediaStatus";
import { postcardMeta } from "@/lib/libraryBoard";
import {
  KIND_META,
  barSummary,
  draftsNeedingFix,
  latestByKind,
  queueKindsOf,
  readiness,
  studioGuide,
  weekToast,
  type Draft,
  type ReadyState,
  type Readiness,
} from "@/lib/studioModel";
import { buildSetupRows, sameTargets, setupSummary, setupToSend, type SetupFrame } from "@/lib/studioSetup";
import { THREADS_CAROUSEL_ID } from "../../convex/slots";

const r = (state: ReadyState, overBy = 0): Readiness => ({ state, overBy, reason: "" });
const draft = (over: Partial<Draft> & { templateKey: string }): Draft =>
  ({ _id: "d1", _creationTime: 0, topicId: "t1", platform: "instagram", body: "Caption", templateVersion: 1, charCount: 7, constraintOk: true, createdAt: 1, ...over }) as unknown as Draft;

describe("the Threads view of a carousel", () => {
  it("uses the id the server queues it under", () => {
    expect(KIND_META.threadsCarousel.templateKey).toBe(THREADS_CAROUSEL_ID);
  });

  it("is the carousel draft itself, present only when the carousel has a Threads text (even an empty one)", () => {
    const plain = latestByKind([draft({ templateKey: "carousel-slides" })]);
    expect(plain.carousel).toBeDefined();
    expect(plain.threadsCarousel).toBeUndefined();
    const going = latestByKind([draft({ templateKey: "carousel-slides", threadsText: "" })]);
    expect(going.threadsCarousel?._id).toBe(going.carousel?._id);
    expect(latestByKind([draft({ templateKey: "carousel-slides", threadsText: "Hello" })]).threadsCarousel).toBeDefined();
  });

  it("joins the queue only with its carousel's Threads text", () => {
    expect(queueKindsOf({})).toEqual(["threads", "caption", "reel"]);
    expect(queueKindsOf({ carousel: r("ready") })).toEqual(["threads", "caption", "reel", "carousel"]);
    expect(queueKindsOf({ carousel: r("ready"), threadsCarousel: r("ready") })).toEqual(["threads", "caption", "reel", "carousel", "threadsCarousel"]);
    expect(queueKindsOf({ carousel: r("ready"), threadsCarousel: r("ready") }, ["carousel"])).toEqual(["threads", "caption", "reel", "threadsCarousel"]);
  });
});

describe("readiness of the Threads text and of media on a thread", () => {
  it("a Threads text is not written when empty, over at 501, and needs the carousel's images", () => {
    expect(readiness({ kind: "threadsCarousel", body: undefined, media: "ok" }).state).toBe("missing");
    expect(readiness({ kind: "threadsCarousel", body: "   ", media: "ok" }).state).toBe("missing");
    expect(readiness({ kind: "threadsCarousel", body: "x".repeat(500), media: "ok" }).state).toBe("ready");
    expect(readiness({ kind: "threadsCarousel", body: "x".repeat(501), media: "ok" })).toMatchObject({ state: "over", overBy: 1 });
    expect(readiness({ kind: "threadsCarousel", body: "Hi", media: "none" }).state).toBe("media_required");
    expect(readiness({ kind: "threadsCarousel", body: "Hi", media: "stale" }).state).toBe("media_stale");
    expect(readiness({ kind: "threadsCarousel", body: "Hi", media: "ok", queued: true }).state).toBe("queued");
  });

  it("media on a thread is optional, but once attached it has to be usable", () => {
    expect(readiness({ kind: "threads", body: "A post", media: "none" }).state).toBe("ready");
    expect(readiness({ kind: "threads", body: "A post", media: "ok" }).state).toBe("ready");
    expect(readiness({ kind: "threads", body: "A post", media: "missing" }).state).toBe("media_missing");
    expect(readiness({ kind: "threads", body: "A post", media: "unverified" }).state).toBe("media_unverified");
    expect(readiness({ kind: "threads", body: "A post", media: "stale" }).state).toBe("media_stale");
  });

  it("a Threads text that needs fixing counts as a blocking draft, unless it is left out", () => {
    const states = { threads: r("ready"), caption: r("ready"), reel: r("missing"), carousel: r("ready"), threadsCarousel: r("over", 20) };
    expect(draftsNeedingFix(states)).toEqual(["threadsCarousel"]);
    expect(draftsNeedingFix(states, [], ["threadsCarousel"])).toEqual([]);
  });
});

describe("the bar and the sentence with a carousel on both platforms", () => {
  const states = { threads: r("ready"), caption: r("missing"), reel: r("missing"), carousel: r("ready"), threadsCarousel: r("ready") };

  it("counts the Threads post as one more draft to queue", () => {
    const bar = barSummary({ states, generating: false, emptySub: "", excluded: ["caption", "reel"] });
    expect(bar).toMatchObject({ readyCount: 3, needFixing: 0, canQueue: true, buttonLabel: "Queue 3 posts" });
  });

  it("asks for the shared images once, whichever post needs them", () => {
    const base = { generating: false, generationFailed: false, manualText: false, hasOpenSlot: true, excluded: ["caption", "reel"] as const };
    const needImages = studioGuide({ ...base, states: { ...states, carousel: r("media_required"), threadsCarousel: r("media_required") } });
    expect(needImages.text).toContain("Draw the slides");
    expect(needImages.text.match(/Draw the slides/g)).toHaveLength(1);
    // The Instagram post left out, the Threads post still needs the images.
    const onlyThreads = studioGuide({ ...base, excluded: ["caption", "reel", "carousel"], states: { ...states, carousel: r("media_required"), threadsCarousel: r("media_required") } });
    expect(onlyThreads.text).toContain("Draw the slides");
  });

  it("says when the Threads text is over the limit, and when the photo on a thread cannot be used", () => {
    const base = { generating: false, generationFailed: false, manualText: false, hasOpenSlot: true, excluded: ["caption", "reel"] as const };
    expect(studioGuide({ ...base, states: { ...states, threadsCarousel: r("over", 12) } }).text).toMatch(/Threads text is over the 500-character limit/);
    expect(studioGuide({ ...base, states: { ...states, threads: r("media_missing") } }).text).toMatch(/photo or video on the thread is gone/);
    expect(studioGuide({ ...base, states: { ...states, threads: r("media_stale") } }).text).toMatch(/Recheck on the thread's photo or video/);
  });
});

describe("the toast after Queue this week", () => {
  it("counts the carousel's Threads post as Threads, and points a media problem at the carousel", () => {
    const out = weekToast({
      queued: [
        { format: "Threads", templateKey: KIND_META.threads.templateKey, scheduledAt: 1 },
        { format: "Threads carousel", templateKey: KIND_META.threadsCarousel.templateKey, scheduledAt: 2 },
        { format: "IG carousel", templateKey: KIND_META.carousel.templateKey, scheduledAt: 3 },
      ],
      skipped: [],
    });
    expect(out.title).toBe("Week queued: 2 Threads, 1 Instagram");
    const media = weekToast({
      queued: [],
      skipped: [{ format: "Threads carousel", templateKey: KIND_META.threadsCarousel.templateKey, code: "MEDIA_STALE", message: "Check the images." }],
    });
    expect(media).toMatchObject({ needsMedia: true, mediaKind: "threadsCarousel" });
    const type = weekToast({
      queued: [],
      skipped: [{ format: "Threads", templateKey: KIND_META.threads.templateKey, code: "MEDIA_TYPE", message: "Threads takes JPEG or PNG." }],
    });
    expect(type).toMatchObject({ needsMedia: true, mediaKind: "threads" });
  });
});

describe("the carousel's platforms in the Studio setup", () => {
  const beats = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `B${i + 1}` }));
  const frames: SetupFrame[] = [{ key: "ig-carousel", name: "Carousel", fits: ["carousel"], beats: beats(4) }];
  const input = (over: Record<string, unknown> = {}) => ({
    choices: {},
    defaults: undefined,
    legacyDefaultKey: undefined,
    legacyPostCount: undefined,
    frames,
    ...over,
  });
  const carousel = (rows: ReturnType<typeof buildSetupRows>) => rows.find((r) => r.kind === "carousel")!;

  it("is Instagram alone by default, follows the saved default, and a pick for this run wins", () => {
    expect(carousel(buildSetupRows(input())).targets).toEqual(["instagram"]);
    expect(carousel(buildSetupRows(input({ defaults: { carousel: { targets: ["instagram", "threads"] } } }))).targets).toEqual(["instagram", "threads"]);
    expect(carousel(buildSetupRows(input({ defaults: { carousel: { targets: ["threads"] } }, choices: { carousel: { targets: ["instagram"] } } }))).targets).toEqual(["instagram"]);
    expect(buildSetupRows(input()).filter((r) => r.kind !== "carousel").every((r) => r.targets.length === 0)).toBe(true);
  });

  it("keeps Threads for a carousel that already goes there, so Regenerate does not drop it", () => {
    expect(carousel(buildSetupRows(input({ usedThreads: true }))).targets).toEqual(["instagram", "threads"]);
    expect(carousel(buildSetupRows(input({ usedThreads: true, choices: { carousel: { targets: ["instagram"] } } }))).targets).toEqual(["instagram"]);
  });

  it("is sent only when it differs from the saved default, and marks the row as changed for Make default", () => {
    const rows = (choices = {}, defaults?: object) => buildSetupRows(input({ choices: { carousel: { include: true, ...choices } }, defaults }));
    const send = (rs: ReturnType<typeof rows>, defaults?: object) => setupToSend(rs, { defaults: defaults as never, legacyPostCount: undefined, frames });
    expect(send(rows()).carousel?.targets).toBeUndefined();
    expect(send(rows({ targets: ["instagram", "threads"] })).carousel?.targets).toEqual(["instagram", "threads"]);
    expect(carousel(rows({ targets: ["instagram", "threads"] })).changed).toBe(true);
    const saved = { carousel: { targets: ["instagram", "threads"] } };
    expect(send(rows({}, saved), saved).carousel?.targets).toBeUndefined();
    expect(send(rows({ targets: ["instagram"] }, saved), saved).carousel?.targets).toEqual(["instagram"]);
  });

  it("is named in the summary line", () => {
    const both = buildSetupRows(input({ choices: { carousel: { include: true, targets: ["instagram", "threads"] } } }));
    expect(setupSummary(both)).toContain("Instagram + Threads");
    const threadsOnly = buildSetupRows(input({ choices: { carousel: { include: true, targets: ["threads"] } } }));
    expect(setupSummary(threadsOnly)).toContain("Threads only");
    expect(sameTargets(["threads", "instagram"], ["instagram", "threads"])).toBe(true);
    expect(sameTargets(["instagram"], ["instagram", "threads"])).toBe(false);
  });
});

describe("labels", () => {
  const asset = { mimeType: "image/jpeg", publicUrl: "https://x.test/a.jpg", verifiedAt: Date.now() };
  it("a verified file reads ready for the platform it is for", () => {
    expect(describeMediaStatus("ready", asset, Date.now()).label).toBe("READY FOR INSTAGRAM");
    expect(describeMediaStatus("ready", asset, Date.now(), "threads").label).toBe("READY FOR THREADS");
  });

  it("a published carousel on Threads says carousel and its slides; a thread still says Threads", () => {
    const base = { platform: "threads" as const, publishedAt: Date.UTC(2026, 9, 9, 12), slideCount: 7 };
    expect(postcardMeta({ ...base, format: "carousel" }, "UTC")).toBe("THREADS · CAROUSEL · 7 SLIDES · 9 OCT");
    expect(postcardMeta({ ...base, format: "carousel", slideCount: null }, "UTC")).toBe("THREADS · CAROUSEL · 9 OCT");
    expect(postcardMeta({ ...base, format: "thread", slideCount: null }, "UTC")).toBe("THREADS · 9 OCT");
    expect(postcardMeta({ platform: "instagram", format: "carousel", publishedAt: base.publishedAt, slideCount: 7 }, "UTC")).toBe("CAROUSEL · 7 SLIDES · 9 OCT");
  });
});
