import { describe, expect, it } from "vitest";
import {
  CANCEL_ARM_MS,
  cancelStatus,
  dayGroupLabel,
  pastAnnouncement,
  pickReturnFocus,
  slotCardLabel,
  viewAnnouncement,
} from "./queueA11y";
import { addDays, type BoardCard, type BoardDay } from "./queueBoard";

function card(over: Partial<BoardCard> = {}): BoardCard {
  return {
    _id: "s1",
    platform: "threads",
    scheduledAt: 0,
    time: "19:00",
    status: "scheduled",
    topicTitle: "Why staking money beats streaks",
    snippet: "",
    constraintOk: true,
    pillarColor: "pillar-tools",
    format: null,
    hasMedia: false,
    attempts: 0,
    lastError: null,
    ...over,
  };
}

function day(i: number, over: Partial<BoardDay> = {}): BoardDay {
  return {
    key: addDays("2026-10-06", i),
    weekday: (1 + i) % 7,
    label: `TUE ${6 + i}`,
    isToday: i === 0,
    threads: [],
    instagram: [],
    open: { threads: [], instagram: [] },
    ...over,
  };
}

describe("slotCardLabel", () => {
  it("names the platform, day, time, topic and the status as a word", () => {
    expect(slotCardLabel(card(), "Tue 6 Oct")).toBe(
      "Threads post on Tue 6 Oct at 19:00, Why staking money beats streaks, scheduled. Open details."
    );
  });
  it("names the Instagram format and every status in words", () => {
    const ig = card({ platform: "instagram", format: "reel", status: "failed", time: "12:00" });
    expect(slotCardLabel(ig, "Wed 7 Oct")).toBe(
      "Instagram reel on Wed 7 Oct at 12:00, Why staking money beats streaks, failed. Open details."
    );
    for (const status of ["scheduled", "claimed", "published", "failed"] as const) {
      expect(slotCardLabel(card({ status }), "Tue 6 Oct")).toContain(`, ${status}.`);
    }
  });
  it("adds the at-risk reason, and leaves the day out only when it is not known", () => {
    const out = slotCardLabel(card({ atRisk: "Reconnect Threads." }));
    expect(out).toContain("Threads post at 19:00");
    expect(out).toContain("At risk: Reconnect Threads.");
  });
});

describe("dayGroupLabel", () => {
  it("names the day, today, and what it holds in words", () => {
    const d = day(0, { threads: [card()], open: { threads: ["09:30", "13:00"], instagram: ["12:00"] } });
    expect(dayGroupLabel(d, "both")).toBe("Tue 6 Oct, today. 1 post, 3 open slots.");
  });
  it("counts failures and respects the platform filter", () => {
    const d = day(1, {
      threads: [card({ status: "failed" }), card({ _id: "s2", time: "13:00" })],
      instagram: [card({ _id: "s3", platform: "instagram" })],
      open: { threads: [], instagram: ["18:30"] },
    });
    expect(dayGroupLabel(d, "threads")).toBe("Wed 7 Oct. 2 posts, 1 failed.");
    expect(dayGroupLabel(d, "instagram")).toBe("Wed 7 Oct. 1 post, 1 open slot.");
  });
  it("says so when a day has no slot", () => {
    expect(dayGroupLabel(day(2), "both")).toBe("Thu 8 Oct. No slot.");
  });
});

describe("viewAnnouncement", () => {
  const days = Array.from({ length: 30 }, (_, i) =>
    day(i, i === 0 ? { threads: [card()], open: { threads: ["09:30"], instagram: [] } } : { open: { threads: ["09:30"], instagram: ["12:00"] } })
  );
  it("says the range, the platform and the counts for exactly the days shown", () => {
    expect(viewAnnouncement(days, "week", "both")).toBe(
      "Showing the week, Threads and Instagram. 1 post, 13 open slots."
    );
    expect(viewAnnouncement(days, "three", "threads")).toBe("Showing 3 weeks, Threads only. 1 post, 21 open slots.");
    expect(viewAnnouncement(days, "month", "instagram")).toBe("Showing the month, Instagram only. 0 posts, 29 open slots.");
  });
});

describe("cancelStatus", () => {
  it("speaks the armed state with its deadline, and nothing when idle", () => {
    expect(cancelStatus(true)).toContain(`within ${CANCEL_ARM_MS / 1000} seconds`);
    expect(cancelStatus(true)).toContain("The draft is kept.");
    expect(cancelStatus(false)).toBe("");
  });
});

describe("pickReturnFocus", () => {
  const live = (name: string) => ({ name, isConnected: true });
  const gone = (name: string) => ({ name, isConnected: false });
  it("prefers the card that opened the sheet while it is still on the page", () => {
    expect(pickReturnFocus(live("opener"), live("byId"), live("fallback"))?.name).toBe("opener");
  });
  it("falls to the post's re-drawn card, then the board control, then nothing", () => {
    expect(pickReturnFocus(gone("opener"), live("byId"), live("fallback"))?.name).toBe("byId");
    expect(pickReturnFocus(gone("opener"), null, live("fallback"))?.name).toBe("fallback");
    expect(pickReturnFocus(gone("opener"), undefined, gone("fallback"))).toBeNull();
    expect(pickReturnFocus<{ isConnected: boolean }>(null, null)).toBeNull();
  });
});

describe("pastAnnouncement", () => {
  it("names the days, the platform and the posts that went out", () => {
    const days = [day(0, { threads: [card({ status: "published" })] }), day(1)];
    expect(pastAnnouncement(days, "both", "2 OCT → 8 OCT")).toBe("Showing the past, 2 OCT → 8 OCT, Threads and Instagram. 1 post.");
    expect(pastAnnouncement(days, "instagram", "2 OCT → 8 OCT")).toBe("Showing the past, 2 OCT → 8 OCT, Instagram only. 0 posts.");
  });
});
