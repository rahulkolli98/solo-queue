import { describe, expect, it } from "vitest";
import { clashesWithNeighbour, isReelTemplate, pillarOf } from "../../convex/lib/queueRules";
import { nextFreeSlot } from "../../convex/lib/zoned";

describe("clashesWithNeighbour", () => {
  const queue = [
    { at: 100, pillar: "build" },
    { at: 300, pillar: "tools" },
  ];

  it("is true when the post just before, or just after, has the same pillar", () => {
    expect(clashesWithNeighbour(queue, 200, "build")).toBe(true); // previous is build
    expect(clashesWithNeighbour(queue, 200, "tools")).toBe(true); // next is tools
    expect(clashesWithNeighbour(queue, 50, "build")).toBe(true); // next is build
  });

  it("is false when both neighbours are other pillars or there are none", () => {
    expect(clashesWithNeighbour(queue, 200, "craft")).toBe(false);
    expect(clashesWithNeighbour([], 200, "build")).toBe(false);
    expect(clashesWithNeighbour(queue, 400, "build")).toBe(false); // previous is tools
  });

  it("only looks at the nearest neighbour on each side, not the whole queue", () => {
    const q = [
      { at: 100, pillar: "build" },
      { at: 150, pillar: "tools" },
    ];
    expect(clashesWithNeighbour(q, 200, "build")).toBe(false);
  });

  it("does not depend on the queue being sorted", () => {
    expect(clashesWithNeighbour([...queue].reverse(), 200, "build")).toBe(true);
  });
});

describe("helpers", () => {
  it("knows a reel by its template and defaults a missing pillar to build", () => {
    expect(isReelTemplate("reel-script")).toBe(true);
    expect(isReelTemplate("ig-caption-beats")).toBe(false);
    expect(pillarOf(undefined)).toBe("build");
    expect(pillarOf("tools")).toBe("tools");
  });
});

describe("nextFreeSlot reject", () => {
  const base = {
    times: ["09:30", "13:00"],
    days: [0, 1, 2, 3, 4, 5, 6],
    tz: "UTC",
    afterMs: Date.UTC(2026, 9, 5, 0, 0),
    taken: [],
  };

  it("skips candidates the veto refuses and returns the next one", () => {
    const first = nextFreeSlot(base);
    const second = nextFreeSlot({ ...base, reject: (ts) => ts === first });
    expect(second).toBeGreaterThan(first);
    expect(nextFreeSlot({ ...base, reject: () => false })).toBe(first);
  });

  it("throws when the veto refuses everything in the horizon", () => {
    expect(() => nextFreeSlot({ ...base, horizonDays: 5, reject: () => true })).toThrow(/No free slot/);
  });
});
