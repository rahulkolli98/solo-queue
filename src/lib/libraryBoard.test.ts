import { describe, expect, it } from "vitest";
import {
  beatsLine,
  checkUploadFile,
  dayMonth,
  draftMeta,
  duplicateFrame,
  effectiveTz,
  emptyFrame,
  fitsLine,
  frameFormErrors,
  keyFromName,
  libraryHeadline,
  matchesDraftFilter,
  matchesSearch,
  mediaName,
  mediaState,
  mimeFromUrl,
  moveBeat,
  postcardMeta,
  tiltFor,
  toggleFit,
  whenLabel,
} from "@/lib/libraryBoard";

describe("time labels", () => {
  const ts = Date.UTC(2026, 8, 24, 21, 30); // 24 Sep 2026, 21:30 UTC
  it("formats day and month in the given zone", () => {
    expect(dayMonth(ts, "UTC")).toBe("24 SEP");
    expect(dayMonth(ts, "Asia/Kolkata")).toBe("25 SEP");
  });
  it("formats a toast time on a 24-hour clock", () => {
    expect(whenLabel(ts, "UTC")).toBe("Thu 24 Sep, 21:30");
    expect(whenLabel(Date.UTC(2026, 8, 24, 0, 5), "UTC")).toBe("Thu 24 Sep, 00:05");
  });
  it("uses the browser zone while the saved one is auto", () => {
    expect(effectiveTz("auto", "Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(effectiveTz(undefined, "UTC")).toBe("UTC");
    expect(effectiveTz("Europe/London", "UTC")).toBe("Europe/London");
  });
});

describe("postcards", () => {
  it("keeps tilts within a degree", () => {
    for (let i = 0; i < 20; i++) expect(Math.abs(tiltFor(i))).toBeLessThanOrEqual(1);
  });
  it("labels Threads and Instagram cards", () => {
    const publishedAt = Date.UTC(2026, 8, 24, 12);
    expect(postcardMeta({ platform: "threads", format: "thread", publishedAt }, "UTC")).toBe("THREADS · 24 SEP");
    expect(postcardMeta({ platform: "instagram", format: "reel", publishedAt }, "UTC")).toBe("REEL · 24 SEP");
    expect(postcardMeta({ platform: "instagram", format: null, publishedAt }, "UTC")).toBe("INSTAGRAM · 24 SEP");
  });
  it("labels draft cards", () => {
    expect(draftMeta("threads", "thread")).toBe("THREADS · THREAD");
    expect(draftMeta("instagram", "carousel")).toBe("CAROUSEL");
    expect(draftMeta("blog", null)).toBe("BLOG");
  });
});

describe("draft filters", () => {
  it("groups statuses", () => {
    expect(matchesDraftFilter("OVER_LIMIT", "fixing")).toBe(true);
    expect(matchesDraftFilter("NEEDS_MEDIA", "fixing")).toBe(true);
    expect(matchesDraftFilter("SAVED", "fixing")).toBe(false);
    expect(matchesDraftFilter("SAVED", "saved")).toBe(true);
    expect(matchesDraftFilter("BLOG", "saved")).toBe(false);
    expect(matchesDraftFilter("BLOG", "all")).toBe(true);
  });
  it("searches case-insensitively and passes an empty search", () => {
    expect(matchesSearch(["Threads API", "body"], "api")).toBe(true);
    expect(matchesSearch(["Threads API"], "reel")).toBe(false);
    expect(matchesSearch(["x"], "  ")).toBe(true);
  });
});

describe("story frames", () => {
  it("writes the fits and beats lines", () => {
    expect(fitsLine(["thread", "reel"])).toBe("FITS · THREADS THREAD · REEL");
    expect(beatsLine([{ label: "Admit" }, { label: "Cost" }], 9)).toBe("ADMIT → COST · USED 9×");
    expect(beatsLine([1, 2, 3, 4, 5].map((n) => ({ label: `Beat number ${n}` })), 2)).toBe("5 BEATS · USED 2×");
  });
  it("derives a valid, unique key from a name", () => {
    expect(keyFromName("Hook, Tension & Turn!", [])).toBe("hook-tension-turn");
    expect(keyFromName("Confession", ["confession"])).toBe("confession-2");
    expect(keyFromName("Confession", ["confession", "confession-2"])).toBe("confession-3");
    expect(keyFromName("2 for 1", [])).toBe("f-2-for-1");
    expect(keyFromName("!!!", [])).toBe("frame");
    expect(keyFromName("x".repeat(80), [])).toMatch(/^[a-z][a-z0-9-]{1,39}$/);
  });
  it("moves a beat one place and stops at the ends", () => {
    expect(moveBeat(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveBeat(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    const same = ["a", "b"];
    expect(moveBeat(same, 0, -1)).toBe(same);
    expect(moveBeat(same, 1, 1)).toBe(same);
  });
  it("toggles a place a frame fits", () => {
    expect(toggleFit(["thread"], "reel")).toEqual(["thread", "reel"]);
    expect(toggleFit(["thread", "reel"], "thread")).toEqual(["reel"]);
  });
  it("starts a new frame with two empty beats", () => {
    const f = emptyFrame("pillar-build");
    expect(f.key).toBeNull();
    expect(f.beats).toHaveLength(2);
  });
  it("duplicates into an unsaved copy", () => {
    const copy = duplicateFrame({
      key: "confession",
      name: "Confession",
      beats: [{ label: "Admit", hint: "h" }, { label: "Cost", hint: "" }],
      fits: ["thread"],
      color: "pillar-build",
    });
    expect(copy.key).toBeNull();
    expect(copy.name).toBe("Confession copy");
    expect(copy.beats[0]).toEqual({ label: "Admit", hint: "h" });
  });
  it("explains what is missing in a frame form", () => {
    const base = emptyFrame("pillar-build");
    expect(frameFormErrors(base)).toEqual({ name: "Give the frame a name.", beats: "Every beat needs a name." });
    expect(
      frameFormErrors({ ...base, name: "A", beats: [{ label: "x", hint: "" }, { label: "y", hint: "" }], fits: [] })
    ).toEqual({ fits: "Choose at least one place it fits." });
    expect(
      frameFormErrors({
        ...base,
        name: "A",
        beats: Array.from({ length: 6 }, () => ({ label: "x", hint: "" })),
      }).beats
    ).toBe("A frame has 2 to 5 beats.");
    expect(
      frameFormErrors({ ...base, name: "A", beats: [{ label: "x", hint: "" }, { label: "y", hint: "" }] })
    ).toEqual({});
  });
});

describe("media", () => {
  it("accepts images and videos up to 50 MB", () => {
    expect(checkUploadFile({ name: "a.png", type: "image/png", size: 1000 })).toBeNull();
    expect(checkUploadFile({ name: "a.mp4", type: "video/mp4", size: 50 * 1024 * 1024 })).toBeNull();
  });
  it("refuses other types and big files", () => {
    expect(checkUploadFile({ name: "a.pdf", type: "application/pdf", size: 10 })).toContain("only images and videos");
    expect(checkUploadFile({ name: "big.mp4", type: "video/mp4", size: 50 * 1024 * 1024 + 1 })).toContain("50 MB");
  });
  it("guesses a type from a URL", () => {
    expect(mimeFromUrl("https://cdn.example.com/a/clip.MP4?x=1")).toBe("video/mp4");
    expect(mimeFromUrl("https://cdn.example.com/a/pic.webp")).toBe("image/webp");
    expect(mimeFromUrl("https://cdn.example.com/a/noext")).toBe("image/jpeg");
    expect(mimeFromUrl("nonsense")).toBe("image/jpeg");
  });
  it("reads the verification state", () => {
    expect(mediaState({ verifiedAt: 1 })).toBe("verified");
    expect(mediaState({ lastVerifyError: "404" })).toBe("unreachable");
    expect(mediaState({})).toBe("unverified");
    expect(mediaState({ verifiedAt: 1, lastVerifyError: "old" })).toBe("verified");
  });
  it("names a tile from the file or the URL", () => {
    expect(mediaName({ filename: "hook.png", publicUrl: "https://x.test/a" })).toBe("hook.png");
    expect(mediaName({ publicUrl: "https://x.test/path/bear%20still.jpg" })).toBe("bear still.jpg");
    expect(mediaName({ publicUrl: "https://x.test/" })).toBe("external link");
  });
});

describe("libraryHeadline", () => {
  it("counts drafts in words", () => {
    const h = libraryHeadline("drafts", { drafts: 12 });
    expect(h.before).toBe("Twelve drafts,");
    expect(h.rust).toBe("waiting");
    expect(libraryHeadline("drafts", { drafts: 1 }).before).toBe("One draft,");
    expect(libraryHeadline("drafts", { drafts: 0 }).before).toBe("No drafts");
  });
  it("counts frames in words", () => {
    expect(libraryHeadline("frames", { frames: 6 })).toMatchObject({ before: "Six frames,", rust: "your" });
  });
  it("has one rust word per tab", () => {
    for (const tab of ["published", "drafts", "frames", "media"] as const) {
      expect(libraryHeadline(tab, {}).rust.length).toBeGreaterThan(0);
    }
  });
});
