import { describe, expect, it } from "vitest";
import {
  DEFAULT_SECTION,
  SETTINGS_SECTIONS,
  findSection,
  groupedSections,
  navMeta,
  postingAsSummary,
  sectionFromPath,
} from "./settingsSections";

describe("settings sections", () => {
  it("lists the nine board sections in order, with unique slugs", () => {
    expect(SETTINGS_SECTIONS.map((s) => s.label)).toEqual([
      "Connections",
      "Posting slots",
      "Queue rules",
      "Notifications",
      "Voice & writing",
      "Content pillars",
      "Media hosting",
      "Plan & billing",
      "Data & account",
    ]);
    const keys = SETTINGS_SECTIONS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(DEFAULT_SECTION).toBe("connections");
  });

  it("groups them as Accounts / Posting / Writing / You for the phone list, whatever the desktop order", () => {
    const groups = groupedSections();
    expect(groups.map((g) => g.group)).toEqual(["Accounts", "Posting", "Writing", "You"]);
    expect(groups.map((g) => g.items.map((s) => s.label))).toEqual([
      ["Connections", "Media hosting"],
      ["Posting slots", "Queue rules", "Content pillars"],
      ["Voice & writing"],
      ["Notifications", "Plan & billing", "Data & account"],
    ]);
  });

  it("uses the board's blurbs for Content pillars and Media hosting", () => {
    expect(findSection("pillars")?.blurb).toBe("The four things you post about, and how often.");
    expect(findSection("media")?.blurb).toBe(
      "Instagram publishes from a public link, so images and videos need a home."
    );
  });

  it("finds a section by slug and reads the section out of a pathname", () => {
    expect(findSection("slots")?.label).toBe("Posting slots");
    expect(findSection("nope")).toBeUndefined();
    expect(sectionFromPath("/settings/voice")).toBe("voice");
    expect(sectionFromPath("/settings/voice/")).toBe("voice");
    expect(sectionFromPath("/settings")).toBeNull();
    expect(sectionFromPath("/settings/unknown")).toBeNull();
    expect(sectionFromPath("/queue")).toBeNull();
  });

  it("shows the board's small counts beside the nav items that have one", () => {
    const live = { connections: 2, slotsPerDay: 5, pillars: 4 };
    expect(navMeta("connections", live)).toBe("2");
    expect(navMeta("slots", live)).toBe("5/DAY");
    expect(navMeta("pillars", live)).toBe("4");
    expect(navMeta("rules", live)).toBe("");
    expect(navMeta("connections", {})).toBe("");
  });

  it("summarises who the app is posting as for the phone list", () => {
    expect(postingAsSummary(undefined)).toBeNull();
    expect(postingAsSummary([])).toBeNull();
    const ok = postingAsSummary([
      { platform: "instagram", handle: "@ig", status: "healthy" },
      { platform: "threads", handle: "@th", status: "healthy" },
    ]);
    expect(ok?.label).toBe("ALL HEALTHY");
    expect(ok?.rows).toEqual([
      { platform: "threads", handle: "@th" },
      { platform: "instagram", handle: "@ig" },
    ]);
    expect(
      postingAsSummary([
        { platform: "threads", handle: "@th", status: "failed" },
        { platform: "instagram", handle: "@ig", status: "healthy" },
      ])?.health
    ).toBe("failed");
    expect(postingAsSummary([{ platform: "threads", handle: "@th", status: "expiring" }])?.label).toBe(
      "EXPIRING SOON"
    );
  });
});
