import { describe, expect, it } from "vitest";
import { buildSetupRows, choicesForAngle, includedKinds, setupSummary, setupToSend, type SetupFrame, type SetupInput } from "@/lib/studioSetup";

const beats = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `B${i + 1}` }));
const frames: SetupFrame[] = [
  { key: "confession", name: "Confession", fits: ["thread", "reel"], beats: beats(4) },
  { key: "hot-take", name: "Hot take", fits: ["thread"], beats: beats(3) },
  { key: "receipt", name: "The receipt", fits: ["single", "carousel"], beats: beats(3) },
  { key: "ig-caption", name: "Caption: hook, value, ask", fits: ["single"], beats: beats(3) },
  { key: "ig-reel", name: "Reel: hook, beats, close", fits: ["reel"], beats: beats(4) },
  { key: "ig-carousel", name: "Carousel: cover, story, close", fits: ["carousel"], beats: beats(4) },
];
const base: SetupInput = { choices: {}, defaults: undefined, legacyDefaultKey: "confession", legacyPostCount: undefined, frames };
const row = (input: SetupInput, kind: string) => buildSetupRows(input).find((r) => r.kind === kind)!;

describe("an untouched run follows the defaults", () => {
  it("ticks threads, caption and reel, not the blog, and picks a frame that fits each", () => {
    const rows = buildSetupRows(base);
    expect(includedKinds(rows)).toEqual(["threads", "caption", "reel"]);
    expect(rows.map((r) => r.frame?.key)).toEqual(["confession", "ig-caption", "confession", "ig-carousel", undefined]);
    expect(rows.every((r) => !r.changed)).toBe(true);
    expect(row(base, "threads").count).toBe(4);
  });

  it("sends the frames but no thread length", () => {
    const rows = buildSetupRows(base);
    expect(setupToSend(rows, base)).toEqual({
      threads: { frameKey: "confession" },
      caption: { frameKey: "ig-caption" },
      reel: { frameKey: "confession" },
    });
  });

  it("the one-line summary names each ticked format, its frame and the posts", () => {
    expect(setupSummary(buildSetupRows(base))).toBe(
      "Threads · Confession · 4 posts   Caption · Caption: hook, value, ask   Reel script · Confession"
    );
  });
});

describe("saved defaults and this run's changes", () => {
  it("saved per-format defaults win over the older single default", () => {
    const input = { ...base, defaults: { threads: { frameKey: "hot-take", count: 6 }, reel: { frameKey: "ig-reel", include: false } } };
    expect(row(input, "threads").frame?.key).toBe("hot-take");
    expect(row(input, "threads").count).toBe(6);
    expect(row(input, "reel").include).toBe(false);
    expect(includedKinds(buildSetupRows(input))).toEqual(["threads", "caption"]);
  });

  it("a pick for this run beats the default and marks the row as changed", () => {
    const input = { ...base, choices: { caption: { frameKey: "receipt" }, threads: { count: 8 } } };
    expect(row(input, "caption").frame?.key).toBe("receipt");
    expect(row(input, "caption").changed).toBe(true);
    expect(row(input, "threads").count).toBe(8);
    expect(row(input, "threads").changed).toBe(true);
    expect(setupToSend(buildSetupRows(input), input).threads).toEqual({ frameKey: "confession", count: 8 });
  });

  it("a thread length equal to what the frame gives is not sent", () => {
    const input = { ...base, choices: { threads: { count: 4 } } };
    expect(setupToSend(buildSetupRows(input), input).threads).toEqual({ frameKey: "confession" });
    const saved = { ...base, defaults: { threads: { count: 6 } }, choices: { threads: { count: 6 } } };
    expect(setupToSend(buildSetupRows(saved), saved).threads).toEqual({ frameKey: "confession" });
  });

  it("only offers frames that fit the format, and ignores a pick that does not fit", () => {
    const input = { ...base, choices: { caption: { frameKey: "hot-take" } } };
    expect(row(input, "caption").frameOptions.map((f) => f.key)).toEqual(["receipt", "ig-caption"]);
    expect(row(input, "caption").frame?.key).toBe("ig-caption");
    expect(row(input, "blog").frameOptions).toEqual([]);
    expect(row(input, "blog").frame).toBeUndefined();
  });

  it("marks the default frame in the options", () => {
    expect(row(base, "caption").frameOptions.find((f) => f.isDefault)?.key).toBe("ig-caption");
  });

  it("keeps the frame an existing draft used when regenerating, unless changed", () => {
    const input = { ...base, usedFrame: { threads: "hot-take" } };
    expect(row(input, "threads").frame?.key).toBe("hot-take");
    expect(row({ ...input, choices: { threads: { frameKey: "confession" } } }, "threads").frame?.key).toBe("confession");
  });

  it("the blog is ticked when a blog draft exists, and can be unticked", () => {
    expect(row({ ...base, hasDraft: { blog: true } }, "blog").include).toBe(true);
    expect(row({ ...base, hasDraft: { blog: true }, choices: { blog: { include: false } } }, "blog").include).toBe(false);
  });

  it("nothing ticked says so and writes nothing", () => {
    const input = { ...base, choices: { threads: { include: false }, caption: { include: false }, reel: { include: false } } };
    const rows = buildSetupRows(input);
    expect(setupSummary(rows)).toBe("Nothing is ticked to write.");
    expect(includedKinds(rows)).toEqual([]);
    expect(setupToSend(rows, input)).toEqual({});
  });
});

describe("the carousel row", () => {
  it("is not ticked by default, shows 6 slides and the seeded carousel frame, and is not sent until ticked", () => {
    const rows = buildSetupRows(base);
    const carousel = rows.find((r) => r.kind === "carousel")!;
    expect(carousel.include).toBe(false);
    expect(carousel.frame?.key).toBe("ig-carousel");
    expect(carousel.count).toBe(6);
    expect(carousel.frameOptions.map((f) => f.key)).toEqual(["receipt", "ig-carousel"]);
    expect(setupToSend(rows, base).carousel).toBeUndefined();
  });

  it("ticking it names the frame, sends a slide count only when it differs, and the summary says slides", () => {
    const ticked = { ...base, choices: { carousel: { include: true } } };
    expect(setupToSend(buildSetupRows(ticked), ticked).carousel).toEqual({ frameKey: "ig-carousel" });
    expect(setupSummary(buildSetupRows(ticked))).toContain("Carousel · Carousel: cover, story, close · 6 slides");
    const eight = { ...base, choices: { carousel: { include: true, count: 8 } } };
    expect(setupToSend(buildSetupRows(eight), eight).carousel).toEqual({ frameKey: "ig-carousel", count: 8 });
    const one = { ...base, choices: { carousel: { include: true, count: 1 } } };
    expect(setupToSend(buildSetupRows(one), one).carousel).toEqual({ frameKey: "ig-carousel", count: 1 });
    expect(setupSummary(buildSetupRows(one))).toContain("Carousel · Carousel: cover, story, close · 1 slide");
    expect(buildSetupRows(eight).find((r) => r.kind === "carousel")?.changed).toBe(true);
  });

  it("a saved default frame and slide count are used, and keep the slide count inside 1 to 10", () => {
    const saved = { ...base, defaults: { carousel: { frameKey: "receipt", count: 8, include: true } } };
    const row = buildSetupRows(saved).find((r) => r.kind === "carousel")!;
    expect(row.include).toBe(true);
    expect(row.frame?.key).toBe("receipt");
    expect(row.count).toBe(8);
    expect(buildSetupRows({ ...base, choices: { carousel: { count: 0 } } }).find((r) => r.kind === "carousel")?.count).toBe(1);
    expect(buildSetupRows({ ...base, choices: { carousel: { count: 1, include: true } } }).find((r) => r.kind === "carousel")?.count).toBe(1);
    expect(buildSetupRows({ ...base, choices: { carousel: { count: 40 } } }).find((r) => r.kind === "carousel")?.count).toBe(10);
  });
});

describe("the carousel's own description and no-frame choice", () => {
  const carouselOf = (choice: object) => {
    const input = { ...base, choices: { carousel: { include: true, ...choice } } };
    return { row: buildSetupRows(input).find((r) => r.kind === "carousel")!, input };
  };

  it("sends the description (trimmed) with the frame, and nothing when it is empty", () => {
    const { row, input } = carouselOf({ brief: "  Explainer, big numbers, calm colours.  " });
    expect(row.brief).toBe("  Explainer, big numbers, calm colours.  ");
    expect(setupToSend(buildSetupRows(input), input).carousel).toEqual({ frameKey: "ig-carousel", brief: "Explainer, big numbers, calm colours." });
    const blank = carouselOf({ brief: "   " });
    expect(setupToSend(buildSetupRows(blank.input), blank.input).carousel).toEqual({ frameKey: "ig-carousel" });
  });

  it("no frame sends noFrame instead of a frame key, and the summary says whose description it is", () => {
    const { row, input } = carouselOf({ noFrame: true, brief: "Only yellow and ink." });
    expect(row.noFrame).toBe(true);
    expect(row.frame).toBeUndefined();
    expect(setupToSend(buildSetupRows(input), input).carousel).toEqual({ noFrame: true, brief: "Only yellow and ink." });
    expect(setupSummary(buildSetupRows(input))).toContain("Carousel · Your description · 6 slides");
    const bare = carouselOf({ noFrame: true });
    expect(setupSummary(buildSetupRows(bare.input))).toContain("Carousel · No story frame · 6 slides");
    // Other formats never carry a description or no-frame.
    const threads = buildSetupRows(input).find((r) => r.kind === "threads")!;
    expect(threads.noFrame).toBe(false);
    expect(threads.brief).toBe("");
  });

  it("neither changes what Make default would save", () => {
    const input = { ...base, choices: { carousel: { noFrame: true, brief: "x" } } };
    expect(buildSetupRows(input).find((r) => r.kind === "carousel")?.changed).toBe(false);
  });
});

describe("Draft this on an angle card", () => {
  it("ticks only the angle's format and picks its frame", () => {
    const input = { ...base, choices: choicesForAngle({ kind: "caption", frameKey: "receipt" }) };
    const rows = buildSetupRows(input);
    expect(includedKinds(rows)).toEqual(["caption"]);
    expect(rows.find((r) => r.kind === "caption")?.frame?.key).toBe("receipt");
    expect(setupSummary(rows)).toBe("Caption · The receipt");
    expect(setupToSend(rows, input)).toEqual({ caption: { frameKey: "receipt" } });
  });

  it("an angle frame that does not fit the format falls back to the saved default", () => {
    const input = { ...base, choices: choicesForAngle({ kind: "reel", frameKey: "hot-take" }) };
    const rows = buildSetupRows(input);
    expect(includedKinds(rows)).toEqual(["reel"]);
    expect(rows.find((r) => r.kind === "reel")?.frame?.key).toBe("confession");
  });

  it("the blog is left out even when a blog draft exists", () => {
    const input = { ...base, hasDraft: { blog: true }, choices: choicesForAngle({ kind: "threads" }) };
    expect(includedKinds(buildSetupRows(input))).toEqual(["threads"]);
  });
});
