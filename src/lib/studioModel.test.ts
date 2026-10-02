import { describe, expect, it } from "vitest";
import {
  barSummary,
  beatLabel,
  formatClock,
  formatElapsed,
  formatWhen,
  saveLabel,
  generationProgress,
  latestByKind,
  mediaState,
  nextOpen,
  openSlotChips,
  openSlots,
  readiness,
  slotChipText,
  weekToast,
  type DayColumn,
  type Draft,
  type Readiness,
} from "@/lib/studioModel";

const HOUR = 3600 * 1000;

function draft(id: string, templateKey: string, createdAt: number): Draft {
  return {
    _id: id,
    _creationTime: createdAt,
    topicId: "t1",
    platform: "threads",
    body: id,
    templateKey,
    templateVersion: 1,
    charCount: 1,
    constraintOk: true,
    createdAt,
  } as unknown as Draft;
}

describe("latestByKind", () => {
  it("picks the newest draft per template", () => {
    const out = latestByKind([
      draft("old-thread", "threads-hook-story", 1),
      draft("new-thread", "threads-hook-story", 3),
      draft("reel", "reel-script", 2),
    ]);
    expect(out.threads?._id).toBe("new-thread");
    expect(out.reel?._id).toBe("reel");
    expect(out.caption).toBeUndefined();
  });
});

describe("mediaState", () => {
  const now = 100 * HOUR;
  it("walks none -> missing -> unverified -> stale -> ok", () => {
    expect(mediaState(undefined, undefined, now)).toBe("none");
    expect(mediaState("m", undefined, now)).toBe("missing");
    expect(mediaState("m", { verifiedAt: undefined }, now)).toBe("unverified");
    expect(mediaState("m", { verifiedAt: now - 25 * HOUR }, now)).toBe("stale");
    expect(mediaState("m", { verifiedAt: now - 2 * HOUR }, now)).toBe("ok");
  });
});

describe("readiness", () => {
  it("is missing for an empty body and queued when queued", () => {
    expect(readiness({ kind: "threads", body: undefined, media: "none" }).state).toBe("missing");
    expect(readiness({ kind: "threads", body: "  ", media: "none" }).state).toBe("missing");
    expect(readiness({ kind: "threads", body: "hi", media: "none", queued: true }).state).toBe("queued");
  });

  it("flags a thread with a post over 500 by the exact count", () => {
    const r = readiness({ kind: "threads", body: `ok\n---\n${"x".repeat(538)}`, media: "none" });
    expect(r).toMatchObject({ state: "over", overBy: 38, reason: "OVER LIMIT" });
  });

  it("needs verified media for Instagram drafts only", () => {
    expect(readiness({ kind: "threads", body: "hi", media: "none" }).state).toBe("ready");
    expect(readiness({ kind: "reel", body: "hi", media: "none" }).state).toBe("media_required");
    expect(readiness({ kind: "caption", body: "hi", media: "missing" }).state).toBe("media_missing");
    expect(readiness({ kind: "caption", body: "hi", media: "unverified" }).state).toBe("media_unverified");
    expect(readiness({ kind: "caption", body: "hi", media: "stale" }).state).toBe("media_stale");
    expect(readiness({ kind: "caption", body: "hi", media: "ok" }).state).toBe("ready");
  });

  it("caps the caption at 2200", () => {
    expect(readiness({ kind: "caption", body: "x".repeat(2250), media: "ok" })).toMatchObject({
      state: "over",
      overBy: 50,
    });
    expect(readiness({ kind: "reel", body: "x".repeat(5000), media: "ok" }).state).toBe("ready");
  });
});

describe("barSummary", () => {
  const ready: Readiness = { state: "ready", overBy: 0, reason: "" };
  const over: Readiness = { state: "over", overBy: 3, reason: "OVER LIMIT" };
  const noMedia: Readiness = { state: "media_required", overBy: 0, reason: "MEDIA MISSING" };

  it("says no drafts yet with nothing written", () => {
    const b = barSummary({ states: {}, generating: false, emptySub: "GENERATE TO START" });
    expect(b).toMatchObject({ headline: "No drafts yet", sub: "GENERATE TO START", canQueue: false });
  });

  it("shows x of y ready while generating and blocks queueing", () => {
    const b = barSummary({
      states: { threads: ready },
      generating: true,
      progress: { done: 1, total: 3 },
      emptySub: "",
    });
    expect(b.headline).toBe("Generating…");
    expect(b.sub).toBe("1 OF 3 DRAFTS READY");
    expect(b.canQueue).toBe(false);
  });

  it("counts drafts ready when everything is fine", () => {
    const b = barSummary({
      states: { threads: ready, caption: ready, reel: ready },
      generating: false,
      emptySub: "",
    });
    expect(b).toMatchObject({
      headline: "3 drafts ready",
      sub: "1 THREADS · 2 INSTA",
      buttonLabel: "Queue 3 posts",
      canQueue: true,
    });
  });

  it("names the problems but still lets the ready ones queue", () => {
    const b = barSummary({
      states: { threads: over, caption: ready, reel: noMedia },
      generating: false,
      emptySub: "",
    });
    expect(b.headline).toBe("1 of 3 ready");
    expect(b.sub).toBe("2 NEED FIXING · OVER LIMIT, MEDIA MISSING");
    expect(b.buttonLabel).toBe("Queue 1 post");
    expect(b.canQueue).toBe(true);
  });

  it("disables the button when nothing is ready", () => {
    const b = barSummary({ states: { threads: over }, generating: false, emptySub: "" });
    expect(b.canQueue).toBe(false);
    expect(b.buttonLabel).toBe("Queue posts");
  });

  it("reports a queued week", () => {
    const queued: Readiness = { state: "queued", overBy: 0, reason: "" };
    const b = barSummary({
      states: { threads: queued, caption: queued, reel: queued },
      generating: false,
      emptySub: "",
    });
    expect(b.headline).toBe("Week queued");
    expect(b.sub).toBe("3 POSTS IN THE QUEUE");
  });
});

describe("open slots", () => {
  const days: DayColumn[] = [
    {
      key: "2026-10-10",
      label: "SAT 10",
      threads: [],
      instagram: [{}],
      open: { threads: ["09:30"], instagram: ["18:30"] },
    },
    {
      key: "2026-10-11",
      label: "SUN 11",
      threads: [{}],
      instagram: [],
      open: { threads: [], instagram: ["12:00"] },
    },
    { key: "2026-10-12", label: "MON 12", threads: [], instagram: [], open: { threads: ["13:00"], instagram: [] } },
  ];

  it("lists open slots in time order and marks days with nothing scheduled as gaps", () => {
    const slots = openSlots(days, 7);
    expect(slots.map((s) => `${s.dayLabel} ${slotChipText(s)}`)).toEqual([
      "SAT 10 TH 09:30",
      "SAT 10 IG 18:30",
      "SUN 11 IG 12:00",
      "MON 12 TH 13:00",
    ]);
    expect(slots.map((s) => s.gap)).toEqual([true, false, true, true]);
    expect(slots[0].when).toBe("SAT 10 OCT · 09:30");
  });

  it("makes one chip per day, preferring the slot that fills a gap", () => {
    const chips = openSlotChips(days, 7);
    expect(chips.map((s) => `${s.dayLabel} ${slotChipText(s)}`)).toEqual([
      "SAT 10 TH 09:30",
      "SUN 11 IG 12:00",
      "MON 12 TH 13:00",
    ]);
    expect(openSlotChips(days, 2)).toHaveLength(2);
    // SAT has a gap on Threads (09:30) and none on Instagram, so the gap wins over the earlier-or-later slot.
    const gapOnly: DayColumn = { ...days[0], threads: [{}], instagram: [] };
    expect(openSlotChips([gapOnly], 1)[0].platform).toBe("instagram");
  });

  it("respects the limit and finds the next slot per platform", () => {
    expect(openSlots(days, 2)).toHaveLength(2);
    expect(nextOpen(days, "instagram")?.when).toBe("SAT 10 OCT · 18:30");
    expect(nextOpen([], "threads")).toBeUndefined();
  });
});

describe("weekToast", () => {
  const q = (templateKey: string) => ({ format: "x", templateKey, scheduledAt: 1 });
  it("counts Threads and Instagram and details what was skipped", () => {
    const t = weekToast({
      queued: [q("threads-hook-story"), q("ig-caption-beats")],
      skipped: [
        {
          format: "IG reel",
          templateKey: "reel-script",
          code: "MEDIA_REQUIRED",
          message: "IG drafts need a photo or video.",
        },
      ],
    });
    expect(t.title).toBe("Week queued: 1 Threads, 1 Instagram");
    expect(t.detail).toBe("1 skipped · IG reel: IG drafts need a photo or video.");
    expect(t.tone).toBe("ok");
    expect(t.needsMedia).toBe(true);
    expect(t.mediaKind).toBe("reel");
  });

  it("is a bad toast when nothing was queued", () => {
    const t = weekToast({
      queued: [],
      skipped: [{ format: "Threads", templateKey: "threads-hook-story", code: "OVER_LIMIT", message: "Too long." }],
    });
    expect(t.title).toBe("Nothing queued");
    expect(t.tone).toBe("bad");
    expect(t.needsMedia).toBe(false);
  });
});

describe("generationProgress", () => {
  it("counts only drafts that were not there before the run", () => {
    const latest = {
      threads: draft("new-1", "threads-hook-story", 5),
      caption: draft("old-2", "ig-caption-beats", 1),
    };
    const p = generationProgress(["threads", "caption", "reel"], latest, new Set(["old-2"]));
    expect(p).toEqual({ done: 1, total: 3, fresh: ["threads"], current: "caption" });
  });

  it("has no current kind when all landed", () => {
    const p = generationProgress(["threads"], { threads: draft("n", "threads-hook-story", 1) }, new Set());
    expect(p.current).toBeNull();
    expect(p.done).toBe(1);
  });
});

describe("small formatters", () => {
  it("formats elapsed time", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(72_000)).toBe("1:12");
  });

  it("formats a 24-hour clock in a zone", () => {
    const ts = Date.UTC(2026, 9, 2, 12, 5);
    expect(formatClock(ts, "UTC")).toBe("12:05");
    expect(formatClock(ts, "Asia/Kolkata")).toBe("17:35");
    expect(formatClock(ts, "Not/AZone")).toMatch(/^\d{2}:\d{2}$/);
  });

  it("labels beats from the frame, falling back to the post number", () => {
    const beats = [{ label: "Hook" }, { label: "Tension" }];
    expect(beatLabel(beats, 1)).toBe("TENSION");
    expect(beatLabel(beats, 4)).toBe("POST 5");
    expect(beatLabel(undefined, 0)).toBe("POST 1");
  });
});

describe("formatWhen and saveLabel", () => {
  it("formats a slot time the way the bar and toast show it", () => {
    const ts = Date.UTC(2026, 9, 15, 9, 30);
    expect(formatWhen(ts, "UTC")).toBe("THU 15 OCT · 09:30");
    expect(formatWhen(ts, "Asia/Kolkata")).toBe("THU 15 OCT · 15:00");
  });

  it("words the save status", () => {
    const at = Date.UTC(2026, 9, 2, 14, 32);
    expect(saveLabel({ state: "saved", savedAt: at }, "UTC")).toBe("Saved 14:32");
    expect(saveLabel({ state: "saving" })).toBe("Saving…");
    expect(saveLabel({ state: "dirty" })).toBe("Unsaved changes…");
    expect(saveLabel({ state: "error" })).toBe("Couldn't save");
    expect(saveLabel({ state: "idle" })).toBe("");
  });
});
