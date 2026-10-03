import { describe, expect, it } from "vitest";
import { NAV_ITEMS, badgeLabel, isActivePath, pageTitle } from "./nav";

describe("isActivePath", () => {
  it("matches Today only on the exact root", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/queue", "/")).toBe(false);
  });

  it("matches a section and its children, not lookalike prefixes", () => {
    expect(isActivePath("/studio", "/studio")).toBe(true);
    expect(isActivePath("/studio/abc123", "/studio")).toBe(true);
    expect(isActivePath("/studios", "/studio")).toBe(false);
    expect(isActivePath("/library/drafts", "/library")).toBe(true);
  });
});

describe("pageTitle", () => {
  it("names each primary route and settings", () => {
    expect(pageTitle("/")).toBe("Today");
    expect(pageTitle("/studio/xyz")).toBe("Studio");
    expect(pageTitle("/queue")).toBe("Queue");
    expect(pageTitle("/settings/slots")).toBe("Settings");
    expect(pageTitle("/log")).toBe("Publishing log");
  });

  it("is empty for an unknown route", () => {
    expect(pageTitle("/nope")).toBe("");
  });
});

describe("badgeLabel", () => {
  it("hides zero and invalid counts and caps large ones", () => {
    expect(badgeLabel(0)).toBeNull();
    expect(badgeLabel(-3)).toBeNull();
    expect(badgeLabel(Number.NaN)).toBeNull();
    expect(badgeLabel(38)).toBe("38");
    expect(badgeLabel(100)).toBe("99+");
  });
});

describe("NAV_ITEMS", () => {
  it("lists the five destinations in design order with unique routes", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual([
      "Today",
      "Studio",
      "Queue",
      "Research",
      "Library",
    ]);
    expect(new Set(NAV_ITEMS.map((i) => i.href)).size).toBe(NAV_ITEMS.length);
  });
});
