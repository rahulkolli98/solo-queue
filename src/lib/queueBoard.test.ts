import { describe, expect, it } from "vitest";
import {
  countDays,
  dayState,
  failedCards,
  firstGap,
  formatStamp,
  fromInputValue,
  queueHeadline,
  shortDay,
  startOfToday,
  stripLabels,
  timelineLabels,
  timelineModel,
  toInputValue,
  addDays,
  type BoardCard,
  type BoardDay,
} from "./queueBoard";

function card(over: Partial<BoardCard> = {}): BoardCard {
  return {
    _id: "s1",
    platform: "threads",
    scheduledAt: 0,
    time: "09:30",
    status: "scheduled",
    topicTitle: "Topic",
    snippet: "Snippet",
    constraintOk: true,
    pillarColor: "pillar-build",
    format: null,
    hasMedia: false,
    attempts: 0,
    lastError: null,
    ...over,
  };
}

function day(i: number, over: Partial<BoardDay> = {}): BoardDay {
  return {
    key: addDays("2026-09-25", i),
    weekday: i % 7,
    label: `D ${i}`,
    isToday: i === 0,
    threads: [],
    instagram: [],
    open: { threads: [], instagram: [] },
    ...over,
  };
}

const window21 = (fill: (i: number) => Partial<BoardDay>) => Array.from({ length: 21 }, (_, i) => day(i, fill(i)));

describe("day keys and labels", () => {
  it("formats a day key", () => {
    expect(shortDay("2026-10-10")).toBe("Sat 10 Oct");
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
  });

  it("formats a stamp in the given zone", () => {
    const ts = Date.UTC(2026, 8, 26, 10, 0); // 12:00 in Berlin (CEST)
    expect(formatStamp(ts, "Europe/Berlin")).toBe("Sat 26 Sep, 12:00");
  });
});

describe("start of today and datetime-local conversion", () => {
  it("returns local midnight as a UTC instant", () => {
    const now = Date.UTC(2026, 8, 25, 22, 30); // 00:30 on the 26th in Berlin
    expect(startOfToday(now, "Europe/Berlin")).toBe(Date.UTC(2026, 8, 25, 22, 0));
  });

  it("round-trips through the input value in the founder's zone", () => {
    const ts = Date.UTC(2026, 8, 26, 10, 0);
    const text = toInputValue(ts, "Europe/Berlin");
    expect(text).toBe("2026-09-26T12:00");
    expect(fromInputValue(text, "Europe/Berlin")).toBe(ts);
  });

  it("rejects malformed input", () => {
    expect(fromInputValue("", "UTC")).toBeNull();
    expect(fromInputValue("tomorrow", "UTC")).toBeNull();
  });
});

describe("dayState and the timeline", () => {
  it("is a gap when a visible platform has open slots and no post", () => {
    const d = day(0, { threads: [card()], open: { threads: [], instagram: ["12:00"] } });
    expect(dayState(d, "both")).toBe("gap");
    expect(dayState(d, "threads")).toBe("written");
    expect(dayState(d, "instagram")).toBe("gap");
  });

  it("is off when there is nothing to write", () => {
    expect(dayState(day(0), "both")).toBe("off");
  });

  it("finds the first gap and the covered span", () => {
    const days = window21((i) => (i < 5 ? { threads: [card()] } : { open: { threads: ["09:30"], instagram: [] } }));
    const model = timelineModel(days, "threads");
    expect(model.firstGap).toBe(5);
    expect(model.covered).toBe(5);
    const gap = firstGap(days, "threads");
    expect(gap?.day.key).toBe("2026-09-30");
    expect(gap?.time).toBe("09:30");
    expect(gap?.platform).toBe("threads");
  });

  it("covers the whole window when there is no gap", () => {
    const days = window21(() => ({ threads: [card()] }));
    const model = timelineModel(days, "threads");
    expect(model.firstGap).toBe(-1);
    expect(model.covered).toBe(21);
    expect(firstGap(days, "threads")).toBeNull();
  });

  it("keeps the labels from overlapping the gap label", () => {
    const days = window21((i) => (i < 9 ? { threads: [card()] } : { open: { threads: ["09:30"], instagram: [] } }));
    const labels = timelineLabels(days, timelineModel(days, "threads"));
    const gap = labels.find((l) => l.tone === "gap");
    expect(gap?.text).toContain("GAP");
    // the "one week out" label (columns 8 to 10) is dropped when the gap sits on top of it
    expect(labels.some((l) => l.col === 8)).toBe(false);
  });

  it("puts the gap label after the today label when the gap is today", () => {
    const labels = stripLabels(["a", "b", "c", "d", "e", "f", "g", "h"], 0, {
      today: () => "TODAY",
      day: () => "DAY",
      gap: () => "GAP",
    });
    expect(labels.find((l) => l.tone === "gap")?.col).toBeGreaterThanOrEqual(4);
  });
});

describe("counts and failures", () => {
  it("counts posts, open slots and failures for the visible platforms", () => {
    const days = [
      day(0, { threads: [card(), card({ _id: "s2", status: "failed" })], instagram: [card({ platform: "instagram", _id: "s3" })] }),
      day(1, { open: { threads: ["09:30", "13:00"], instagram: ["12:00"] } }),
    ];
    expect(countDays(days, "both", 7)).toEqual({ threads: 2, instagram: 1, open: 3, failed: 1 });
    expect(countDays(days, "threads", 7)).toEqual({ threads: 2, instagram: 0, open: 2, failed: 1 });
    expect(countDays(days, "both", 1).open).toBe(0);
  });

  it("lists failed cards oldest first", () => {
    const days = [
      day(0, { threads: [card({ _id: "late", status: "failed", scheduledAt: 20 })] }),
      day(1, { instagram: [card({ _id: "early", status: "failed", scheduledAt: 10, platform: "instagram" })] }),
    ];
    expect(failedCards(days).map((c) => c._id)).toEqual(["early", "late"]);
  });
});

describe("queueHeadline", () => {
  it("says the queue is empty with no posts", () => {
    expect(queueHeadline(0, 0)).toEqual({ top: "Queue's", rust: "empty.", rest: "" });
  });

  it("scales the claim to the days covered", () => {
    expect(queueHeadline(21, 30).top).toBe("Three weeks,");
    expect(queueHeadline(15, 30).top).toBe("Two weeks,");
    expect(queueHeadline(8, 30).top).toBe("A week,");
    expect(queueHeadline(1, 3).top).toBe("1 day,");
    expect(queueHeadline(4, 3).top).toBe("4 days,");
    expect(queueHeadline(0, 3).rust).toBe("queue.");
  });
});
