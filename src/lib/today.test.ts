import { describe, expect, it } from "vitest";
import type { RunwayCell } from "../../convex/lib/coverage";
import {
  coverageOf,
  firstOpenCell,
  metaState,
  nextOpenDay,
  pillarInsight,
  relativeIn,
  runwayAria,
  runwayDay,
  runwayNote,
  runwayRange,
  todayHeadline,
  tokenLabel,
  topicFromInput,
  weekTag,
  type TodaySummary,
} from "./today";

const cells = (written: number, open: number): RunwayCell[] =>
  Array.from({ length: 21 }, (_, i) => (i < written ? "written" : i < written + open ? "open" : "off"));

function summary(over: Partial<TodaySummary> = {}): TodaySummary {
  return {
    tz: "UTC",
    today: "2026-09-25",
    firstRun: false,
    steps: { threadsConnected: true, hasTopic: true, queuedWeek: true },
    upNext: null,
    runway: {
      threads: { cells: cells(20, 1), daysAhead: 20, posts: 22, emptyDays: ["2026-10-15"] },
      instagram: { cells: cells(15, 3), daysAhead: 15, posts: 16, emptyDays: ["2026-10-10"] },
    },
    inbox: { count: 0, top: [] },
    pillarMix: [],
    meta: {
      connections: [
        { platform: "threads", connected: true, handle: "@a", status: "healthy", tokenExpiresAt: 0, tokenDaysLeft: 41, used24h: 3, limit: 250 },
        { platform: "instagram", connected: true, handle: "@a", status: "healthy", tokenExpiresAt: 0, tokenDaysLeft: 58, used24h: 2, limit: 100 },
      ],
      feesThisMonth: 0,
    },
    alerts: [],
    ...over,
  } as TodaySummary;
}

describe("labels", () => {
  it("builds the week tag from the ISO week in the zone", () => {
    expect(weekTag(Date.UTC(2026, 8, 25, 12), "UTC")).toBe("Week 39");
  });

  it("describes time until the next post", () => {
    expect(relativeIn(-5)).toBe("now");
    expect(relativeIn(14 * 60000)).toBe("in 14m");
    expect(relativeIn((2 * 60 + 14) * 60000)).toBe("in 2h 14m");
    expect(relativeIn((26 * 60 + 5) * 60000)).toBe("in 1d 2h");
  });

  it("formats the runway span and day labels", () => {
    expect(runwayRange("2026-09-25")).toBe("25 SEP → 15 OCT");
    expect(runwayDay("2026-09-25")).toBe("FRI 25");
  });

  it("describes a strip for assistive tech", () => {
    expect(runwayAria("Threads", cells(20, 1), ["2026-10-15"])).toBe("Threads: 20 of 21 days written. First gap Thu 15 Oct.");
    expect(runwayAria("Threads", cells(21, 0), [])).toContain("No gaps.");
  });
});

describe("coverage", () => {
  it("names the last covered day", () => {
    expect(coverageOf("2026-09-25", 20)).toEqual({ days: 20, through: "Wed 14 Oct", capped: false });
    expect(coverageOf("2026-09-25", 0).through).toBeNull();
    expect(coverageOf("2026-09-25", 21).capped).toBe(true);
  });

  it("finds the earliest open day over both platforms", () => {
    expect(nextOpenDay(summary())).toEqual({ platform: "instagram", key: "2026-10-10" });
    expect(firstOpenCell(summary())).toBe(15);
  });
});

describe("todayHeadline", () => {
  it("is calm when both queues are deep", () => {
    expect(todayHeadline(summary())).toEqual({ top: "38 posts queued.", plain: "Nothing to write ", rust: "today." });
  });

  it("asks for words when a connected platform is thin", () => {
    const s = summary({ runway: { ...summary().runway, instagram: { cells: cells(2, 5), daysAhead: 2, posts: 2, emptyDays: ["2026-09-28"] } } });
    expect(todayHeadline(s).plain).toBe("Write something ");
  });

  it("puts the failed post first", () => {
    const s = summary({ alerts: [{ id: "failed:1", kind: "failed", platform: "instagram", title: "t", detail: "d" }] });
    expect(todayHeadline(s)).toMatchObject({ plain: "Fix the failed ", rust: "post." });
  });

  it("handles an empty queue", () => {
    const empty = { cells: cells(0, 3), daysAhead: 0, posts: 0, emptyDays: [] };
    const s = summary({ runway: { threads: empty, instagram: empty } });
    expect(todayHeadline(s).top).toBe("Nothing queued.");
  });
});

describe("runwayNote", () => {
  it("shows the date span when nothing needs attention", () => {
    expect(runwayNote(summary())).toEqual({ text: "25 SEP → 15 OCT", warn: false });
  });

  it("lists what needs attention when alerts are up", () => {
    const s = summary({
      alerts: [
        { id: "failed:1", kind: "failed", platform: "instagram", title: "t", detail: "d" },
        { id: "expiring:threads", kind: "expiring", platform: "threads", title: "t", detail: "d" },
      ],
    });
    expect(runwayNote(s)).toEqual({ text: "1 FAILED · 4 OPEN · TOKEN AT RISK", warn: true });
  });
});

describe("pillarInsight", () => {
  const mix = (a: number, b: number) => [
    { key: "build", name: "Build in public", color: "pillar-build", target: 40, count: a, actual: a },
    { key: "tools", name: "AI & tools", color: "pillar-tools", target: 60, count: b, actual: b },
  ];

  it("says there is no mix with nothing queued", () => {
    expect(pillarInsight(mix(0, 0))).toBe("Nothing queued, so no mix yet.");
  });

  it("names the pillar furthest from its target", () => {
    expect(pillarInsight(mix(70, 30))).toBe("Build in public is 30 points over target.");
    expect(pillarInsight(mix(42, 58))).toBe("On target.");
  });
});

describe("tokens and connection state", () => {
  const live = (over: object) => ({ platform: "threads", connected: true, handle: "@a", status: "healthy", tokenExpiresAt: 0, tokenDaysLeft: 41, used24h: 0, limit: 250, ...over }) as TodaySummary["meta"]["connections"][number];

  it("words the token row", () => {
    expect(tokenLabel(live({}))).toEqual({ text: "REFRESH IN 41 D", warn: false });
    expect(tokenLabel(live({ tokenDaysLeft: 6 }))).toEqual({ text: "EXPIRES IN 6 D", warn: true });
    expect(tokenLabel(live({ status: "failed" }))).toEqual({ text: "NEEDS RECONNECT", warn: true });
    expect(tokenLabel({ platform: "instagram", connected: false })).toEqual({ text: "NOT CONNECTED", warn: false });
  });

  it("rolls the connections up to one state", () => {
    expect(metaState([live({})])).toBe("healthy");
    expect(metaState([live({}), live({ tokenDaysLeft: 3 })])).toBe("needs");
    expect(metaState([{ platform: "threads", connected: false }])).toBe("none");
  });
});

describe("topicFromInput", () => {
  it("ignores empty input", () => {
    expect(topicFromInput("   ")).toBeNull();
  });

  it("keeps a half-thought as the title", () => {
    expect(topicFromInput(" Why I stopped paying per post ")).toEqual({ title: "Why I stopped paying per post" });
  });

  it("keeps a pasted link as the source and takes the host as the title", () => {
    expect(topicFromInput("https://www.example.com/a/b?x=1")).toEqual({
      title: "example.com",
      sourceUrl: "https://www.example.com/a/b?x=1",
    });
  });
});
