import { describe, expect, it } from "vitest";
import {
  defaultInclude,
  defaultsOfFrame,
  resolveCount,
  resolveFrameKey,
  setFrameDefault,
  withFormatDefault,
  type FormatDefaults,
} from "./formatSetup";
import type { FrameFit } from "./framesModel";

const frame = (key: string, fits: FrameFit[], isActive = true) => ({ key, fits, isActive });
const FRAMES = [
  frame("confession", ["thread", "reel"]),
  frame("hot-take", ["thread"]),
  frame("receipt", ["single", "carousel"]),
  frame("ig-caption", ["single"]),
  frame("ig-reel", ["reel"]),
];

describe("resolveFrameKey", () => {
  it("prefers the saved default for the format", () => {
    const defaults: FormatDefaults = { threads: { frameKey: "hot-take" }, caption: { frameKey: "receipt" } };
    expect(resolveFrameKey({ kind: "threads", defaults, legacyDefaultKey: "confession", frames: FRAMES })).toBe("hot-take");
    expect(resolveFrameKey({ kind: "caption", defaults, legacyDefaultKey: "confession", frames: FRAMES })).toBe("receipt");
  });

  it("falls back to the older single default only where it fits", () => {
    expect(resolveFrameKey({ kind: "threads", legacyDefaultKey: "confession", frames: FRAMES })).toBe("confession");
    expect(resolveFrameKey({ kind: "reel", legacyDefaultKey: "confession", frames: FRAMES })).toBe("confession");
    // confession does not fit a caption, so the seeded caption frame is used.
    expect(resolveFrameKey({ kind: "caption", legacyDefaultKey: "confession", frames: FRAMES })).toBe("ig-caption");
  });

  it("skips a saved frame that is retired, missing or does not fit", () => {
    const retired = [frame("hot-take", ["thread"], false), ...FRAMES.filter((f) => f.key !== "hot-take")];
    expect(resolveFrameKey({ kind: "threads", defaults: { threads: { frameKey: "hot-take" } }, legacyDefaultKey: "confession", frames: retired })).toBe("confession");
    expect(resolveFrameKey({ kind: "threads", defaults: { threads: { frameKey: "gone" } }, legacyDefaultKey: "confession", frames: FRAMES })).toBe("confession");
    expect(resolveFrameKey({ kind: "caption", defaults: { caption: { frameKey: "hot-take" } }, frames: FRAMES })).toBe("ig-caption");
  });

  it("is none for the blog, and for a format with nothing that fits", () => {
    expect(resolveFrameKey({ kind: "blog", defaults: { blog: { frameKey: "confession" } }, legacyDefaultKey: "confession", frames: FRAMES })).toBeUndefined();
    expect(resolveFrameKey({ kind: "carousel", legacyDefaultKey: "confession", frames: [frame("confession", ["thread"])] })).toBeUndefined();
  });
});

describe("resolveCount and defaultInclude", () => {
  it("uses the saved count, then the older thread length, else leaves it to the frame", () => {
    expect(resolveCount({ kind: "threads", defaults: { threads: { count: 6 } }, legacyPostCount: 4 })).toBe(6);
    expect(resolveCount({ kind: "threads", legacyPostCount: 4 })).toBe(4);
    expect(resolveCount({ kind: "threads", legacyPostCount: 0 })).toBeUndefined();
    expect(resolveCount({ kind: "reel", legacyPostCount: 4 })).toBeUndefined();
    expect(resolveCount({ kind: "carousel", defaults: { carousel: { count: 7 } } })).toBe(7);
  });

  it("writes threads, caption and reel unless told otherwise, and never the blog or carousel by itself", () => {
    expect(defaultInclude("threads", undefined)).toBe(true);
    expect(defaultInclude("reel", undefined)).toBe(true);
    expect(defaultInclude("blog", undefined)).toBe(false);
    expect(defaultInclude("carousel", undefined)).toBe(false);
    expect(defaultInclude("reel", { reel: { include: false } })).toBe(false);
    expect(defaultInclude("blog", { blog: { include: true } })).toBe(true);
  });
});

describe("saving defaults", () => {
  it("withFormatDefault sets and removes fields and drops empty entries", () => {
    const a = withFormatDefault(undefined, "threads", { frameKey: "hot-take", count: 5 });
    expect(a).toEqual({ threads: { frameKey: "hot-take", count: 5 } });
    const b = withFormatDefault(a, "threads", { count: null });
    expect(b).toEqual({ threads: { frameKey: "hot-take" } });
    expect(withFormatDefault(b, "threads", { frameKey: null })).toBeUndefined();
    expect(withFormatDefault(a, "reel", { include: false })).toEqual({ threads: { frameKey: "hot-take", count: 5 }, reel: { include: false } });
  });

  it("one frame is the default for a format at a time", () => {
    const a = setFrameDefault(undefined, "threads", "confession", true);
    const b = setFrameDefault(a, "threads", "hot-take", true);
    expect(b).toEqual({ threads: { frameKey: "hot-take" } });
    // Turning off a frame that is not the saved default changes nothing.
    expect(setFrameDefault(b, "threads", "confession", false)).toBe(b);
    expect(setFrameDefault(b, "threads", "hot-take", false)).toBeUndefined();
  });

  it("a frame can be the default for more than one format", () => {
    let d = setFrameDefault(undefined, "threads", "confession", true);
    d = setFrameDefault(d, "reel", "confession", true);
    expect(defaultsOfFrame(d, "confession")).toEqual(["threads", "reel"]);
    expect(defaultsOfFrame(d, "hot-take")).toEqual([]);
  });
});
