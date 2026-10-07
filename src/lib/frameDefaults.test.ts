import { describe, expect, it } from "vitest";
import {
  FRAME_FORMATS,
  beatsHint,
  defaultChipLabel,
  defaultToggles,
  effectiveDefaultKinds,
  fitsForFormat,
  formatOfFits,
  voiceWithFrameDefault,
} from "./frameDefaults";
import type { FrameFit } from "./libraryBoard";

const frames = [
  { key: "confession", fits: ["thread"] as FrameFit[] },
  { key: "hot-take", fits: ["thread", "single"] as FrameFit[] },
  { key: "ig-caption", fits: ["single"] as FrameFit[] },
  { key: "ig-reel", fits: ["reel"] as FrameFit[] },
  { key: "slides", fits: ["carousel"] as FrameFit[] },
];

describe("formats", () => {
  it("lists the four frame formats with their fit and label", () => {
    expect(FRAME_FORMATS.map((f) => [f.kind, f.fit, f.label])).toEqual([
      ["threads", "thread", "Threads"],
      ["caption", "single", "Caption"],
      ["reel", "reel", "Reel script"],
      ["carousel", "carousel", "Carousel"],
    ]);
  });

  it("maps a format to its fits and back", () => {
    expect(fitsForFormat("caption")).toEqual(["single"]);
    expect(fitsForFormat("carousel")).toEqual(["carousel"]);
    expect(formatOfFits(["reel", "carousel"])).toBe("reel");
    expect(formatOfFits([])).toBe("threads");
  });

  it("words the beat hint by what a beat is", () => {
    expect(beatsHint(["carousel"])).toContain("Each beat is one slide");
    expect(beatsHint(["thread"])).toContain("one post in the thread");
    expect(beatsHint(["single"])).toContain("caption");
    expect(beatsHint(["reel"])).toContain("script");
    expect(beatsHint(["thread", "carousel"])).toContain("one step of the story");
  });

  it("labels the chip in capitals", () => {
    expect(defaultChipLabel("threads")).toBe("DEFAULT · THREADS");
    expect(defaultChipLabel("reel")).toBe("DEFAULT · REEL SCRIPT");
  });
});

describe("effectiveDefaultKinds", () => {
  it("follows the saved pick first", () => {
    const voice = { defaultFrameKey: "confession", formatDefaults: { threads: { frameKey: "hot-take" } } };
    expect(effectiveDefaultKinds("hot-take", voice, frames)).toEqual(["threads"]);
    expect(effectiveDefaultKinds("confession", voice, frames)).toEqual([]);
  });

  it("falls back to the older single default where it fits, then the seeded frame", () => {
    const voice = { defaultFrameKey: "hot-take" };
    expect(effectiveDefaultKinds("hot-take", voice, frames)).toEqual(["threads", "caption"]);
    expect(effectiveDefaultKinds("ig-caption", voice, frames)).toEqual([]);
    expect(effectiveDefaultKinds("ig-reel", voice, frames)).toEqual(["reel"]);
  });

  it("skips a retired or mismatched saved pick", () => {
    const voice = { defaultFrameKey: "confession", formatDefaults: { threads: { frameKey: "gone" }, carousel: { frameKey: "confession" } } };
    expect(effectiveDefaultKinds("confession", voice, frames)).toEqual(["threads"]);
    expect(effectiveDefaultKinds("gone", voice, frames)).toEqual([]);
    const retired = [{ key: "hot-take", isActive: false, fits: ["thread"] as FrameFit[] }, ...frames.slice(0, 1)];
    expect(effectiveDefaultKinds("hot-take", { formatDefaults: { threads: { frameKey: "hot-take" } } }, retired)).toEqual([]);
  });

  it("is empty while the settings are loading", () => {
    expect(effectiveDefaultKinds("confession", undefined, frames)).toEqual([]);
  });
});

describe("defaultToggles", () => {
  it("makes one toggle per format the frame fits", () => {
    const t = defaultToggles(frames[1], { defaultFrameKey: "confession" }, frames);
    expect(t.map((x) => x.kind)).toEqual(["threads", "caption"]);
    expect(t.every((x) => !x.on)).toBe(true);
  });

  it("is on and clearable when the frame is the saved pick", () => {
    const t = defaultToggles(frames[1], { defaultFrameKey: "confession", formatDefaults: { caption: { frameKey: "hot-take" } } }, frames);
    expect(t.find((x) => x.kind === "caption")).toMatchObject({ on: true, inherited: false });
    expect(t.find((x) => x.kind === "threads")).toMatchObject({ on: false });
  });

  it("is on but inherited when only the older default (or the seeded frame) makes it the default", () => {
    const legacy = defaultToggles(frames[0], { defaultFrameKey: "confession" }, frames);
    expect(legacy).toEqual([{ kind: "threads", label: "Threads", on: true, inherited: true }]);
    const seeded = defaultToggles(frames[2], { defaultFrameKey: "confession" }, frames);
    expect(seeded).toEqual([{ kind: "caption", label: "Caption", on: true, inherited: true }]);
  });
});

describe("voiceWithFrameDefault", () => {
  const base = { description: "d", defaultFrameKey: "confession", bannedWords: [] as string[] };

  it("saves the pick and keeps the rest of the voice", () => {
    const out = voiceWithFrameDefault(base, "reel", "ig-reel", true);
    expect(out).toEqual({ ...base, formatDefaults: { reel: { frameKey: "ig-reel" } } });
    expect(base).not.toHaveProperty("formatDefaults");
  });

  it("replaces the earlier pick for the same format only", () => {
    const voice = { ...base, formatDefaults: { threads: { frameKey: "a", count: 4 }, reel: { frameKey: "r" } } };
    const out = voiceWithFrameDefault(voice, "threads", "b", true);
    expect(out.formatDefaults).toEqual({ threads: { frameKey: "b", count: 4 }, reel: { frameKey: "r" } });
  });

  it("clears only when this frame is the saved pick", () => {
    const voice = { ...base, formatDefaults: { threads: { frameKey: "a", count: 4 } } };
    expect(voiceWithFrameDefault(voice, "threads", "other", false).formatDefaults).toEqual({
      threads: { frameKey: "a", count: 4 },
    });
    expect(voiceWithFrameDefault(voice, "threads", "a", false).formatDefaults).toEqual({ threads: { count: 4 } });
  });

  it("removes an emptied formatDefaults instead of sending undefined", () => {
    const voice = { ...base, formatDefaults: { carousel: { frameKey: "slides" } } };
    const out = voiceWithFrameDefault(voice, "carousel", "slides", false);
    expect(out).toEqual(base);
    expect("formatDefaults" in out).toBe(false);
  });
});
