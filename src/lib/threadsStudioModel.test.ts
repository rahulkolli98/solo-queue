import { describe, expect, it } from "vitest";
import { describeMediaStatus } from "@/lib/mediaStatus";
import { draftMeta, postcardMeta } from "@/lib/libraryBoard";
import {
  KIND_META,
  barSummary,
  draftsNeedingFix,
  readiness,
  studioGuide,
  weekToast,
  type ReadyState,
  type Readiness,
} from "@/lib/studioModel";
import { buildSetupRows, sameTargets, setupSummary, setupToSend, type SetupFrame } from "@/lib/studioSetup";

const r = (state: ReadyState, overBy = 0): Readiness => ({ state, overBy, reason: "" });

describe("a thread whose first post carries a carousel", () => {
  it("needs the carousel's images: no images drawn is media required, drawn and checked is ready", () => {
    expect(readiness({ kind: "threads", body: "A post", media: "none", needsMedia: true }).state).toBe("media_required");
    expect(readiness({ kind: "threads", body: "A post", media: "ok", needsMedia: true }).state).toBe("ready");
    expect(readiness({ kind: "threads", body: "A post", media: "stale", needsMedia: true }).state).toBe("media_stale");
    expect(readiness({ kind: "threads", body: "A post", media: "missing", needsMedia: true }).state).toBe("media_missing");
    expect(readiness({ kind: "threads", body: "A post", media: "ok", needsMedia: true, queued: true }).state).toBe("queued");
  });

  it("a thread with nothing on its first post needs no media at all", () => {
    expect(readiness({ kind: "threads", body: "A post", media: "none" }).state).toBe("ready");
    expect(readiness({ kind: "threads", body: "A post", media: "none", needsMedia: false }).state).toBe("ready");
  });

  it("media on a thread is optional, but once attached it has to be usable", () => {
    expect(readiness({ kind: "threads", body: "A post", media: "ok" }).state).toBe("ready");
    expect(readiness({ kind: "threads", body: "A post", media: "missing" }).state).toBe("media_missing");
    expect(readiness({ kind: "threads", body: "A post", media: "unverified" }).state).toBe("media_unverified");
    expect(readiness({ kind: "threads", body: "A post", media: "stale" }).state).toBe("media_stale");
  });

  it("a thread over the limit says so before it asks for images", () => {
    expect(readiness({ kind: "threads", body: "x".repeat(501), media: "none", needsMedia: true }).state).toBe("over");
  });
});

describe("the bar and the sentence for a thread that carries the carousel", () => {
  const base = { generating: false, generationFailed: false, manualText: false, hasOpenSlot: true };

  it("asks for the carousel's images once, in the carousel's words, even when the Instagram post is left out", () => {
    const states = { threads: r("media_required"), caption: r("missing"), reel: r("missing"), carousel: r("media_required") };
    const both = studioGuide({ ...base, states, threadCarousel: true, excluded: ["caption", "reel"] });
    expect(both.text).toContain("Draw the slides");
    expect(both.text.match(/Draw the slides/g)).toHaveLength(1);
    const onlyThread = studioGuide({ ...base, states, threadCarousel: true, excluded: ["caption", "reel", "carousel"] });
    expect(onlyThread.text).toContain("Draw the slides");
  });

  it("does not talk about a photo on the thread when the first post carries a carousel", () => {
    const states = { threads: r("media_stale"), caption: r("missing"), reel: r("missing"), carousel: r("ready") };
    const carries = studioGuide({ ...base, states, threadCarousel: true, excluded: ["caption", "reel"] });
    expect(carries.text).not.toMatch(/photo or video on the thread/);
    const photo = studioGuide({ ...base, states, excluded: ["caption", "reel"] });
    expect(photo.text).toMatch(/Recheck on the thread's photo or video/);
    const gone = studioGuide({ ...base, states: { ...states, threads: r("media_missing") }, excluded: ["caption", "reel"] });
    expect(gone.text).toMatch(/photo or video on the thread is gone/);
  });

  it("the bar counts the thread as needing a fix until the images are drawn, and as ready after", () => {
    const need = { threads: r("media_required"), caption: r("missing"), reel: r("missing"), carousel: r("media_required") };
    expect(draftsNeedingFix(need, [], ["caption", "reel"])).toEqual(["threads", "carousel"]);
    const done = { threads: r("ready"), caption: r("missing"), reel: r("missing"), carousel: r("ready") };
    expect(barSummary({ states: done, generating: false, emptySub: "", excluded: ["caption", "reel"] })).toMatchObject({ readyCount: 2, needFixing: 0, buttonLabel: "Queue 2 posts" });
  });
});

describe("the toast after Queue this week", () => {
  it("points a media problem at the right draft", () => {
    const media = weekToast({
      queued: [],
      skipped: [{ format: "Threads", templateKey: KIND_META.threads.templateKey, code: "MEDIA_STALE", message: "Check the images." }],
    });
    expect(media).toMatchObject({ needsMedia: true, mediaKind: "threads" });
    const type = weekToast({
      queued: [],
      skipped: [{ format: "Threads", templateKey: KIND_META.threads.templateKey, code: "MEDIA_TYPE", message: "Threads takes JPEG or PNG." }],
    });
    expect(type).toMatchObject({ needsMedia: true, mediaKind: "threads" });
    expect(weekToast({ queued: [{ format: "Threads", templateKey: KIND_META.threads.templateKey, scheduledAt: 1 }], skipped: [] }).title).toBe("Week queued: 1 Threads, 0 Instagram");
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

  it("a thread that carries a carousel says so, with its slides; a plain thread and an Instagram carousel keep their labels", () => {
    const base = { platform: "threads" as const, publishedAt: Date.UTC(2026, 9, 9, 12) };
    expect(postcardMeta({ ...base, format: "thread", slideCount: 7 }, "UTC")).toBe("THREADS · THREAD · 7 SLIDES · 9 OCT");
    expect(postcardMeta({ ...base, format: "thread", slideCount: 1 }, "UTC")).toBe("THREADS · THREAD · 1 SLIDE · 9 OCT");
    expect(postcardMeta({ ...base, format: "thread", slideCount: null }, "UTC")).toBe("THREADS · 9 OCT");
    expect(postcardMeta({ platform: "instagram", format: "carousel", publishedAt: base.publishedAt, slideCount: 7 }, "UTC")).toBe("CAROUSEL · 7 SLIDES · 9 OCT");
  });

  it("the Library draft card says the same", () => {
    expect(draftMeta("threads", "thread", 6)).toBe("THREADS · THREAD · 6 SLIDES");
    expect(draftMeta("threads", "thread", null)).toBe("THREADS · THREAD");
    expect(draftMeta("instagram", "carousel", 6)).toBe("CAROUSEL · 6 SLIDES");
  });
});
