import { describe, expect, it } from "vitest";
import {
  DEFAULT_SECTION,
  SETTINGS_SECTIONS,
  findSection,
  groupedSections,
  navMeta,
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

  it("groups them as Accounts / Posting / Writing / You for the phone list", () => {
    const groups = groupedSections();
    expect(groups.map((g) => g.group)).toEqual(["Accounts", "Posting", "Writing", "You"]);
    expect(groups.map((g) => g.items.length)).toEqual([1, 3, 2, 3]);
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
});
