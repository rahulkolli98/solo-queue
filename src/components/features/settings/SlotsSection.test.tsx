import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../../convex/lib/settingsModel";

let overrides: Record<string, unknown> = {};
let loaded = true;
vi.mock("convex/react", () => ({
  useQuery: () => (loaded ? { ...DEFAULT_SETTINGS, ...overrides } : undefined),
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("../../../../convex/_generated/api", () => ({
  api: { settings: { get: "settings.get", update: "settings.update" } },
}));

import SlotsSection from "./SlotsSection";

const render = () => renderToStaticMarkup(<SlotsSection />);

describe("SlotsSection", () => {
  beforeEach(() => {
    loaded = true;
    overrides = {};
  });

  it("shows the saved times as chips with 44px remove buttons per platform", () => {
    const out = render();
    for (const t of ["09:30", "13:00", "19:00"]) {
      expect(out).toContain(`<span>${t}</span>`);
      expect(out).toContain(`aria-label="Remove ${t} from Threads"`);
    }
    for (const t of ["12:00", "18:30"]) expect(out).toContain(`aria-label="Remove ${t} from Instagram"`);
    expect(out).toContain("3 / DAY");
    expect(out).toContain("2 / DAY");
    expect(out).toContain('type="time"');
    expect(out).toContain("Add time");
  });

  it("shows seven day toggles per platform, Monday first, pressed as saved", () => {
    const out = render();
    const threads = out.slice(out.indexOf('aria-label="Threads posting days"'), out.indexOf('aria-label="Instagram posting slots"'));
    expect(threads.match(/aria-pressed="true"/g)).toHaveLength(7);
    const instagram = out.slice(out.indexOf('aria-label="Instagram posting days"'));
    // Default instagram days are Mon, Wed, Fri, Sat, Sun (Monday = 0).
    const pressed = [...instagram.matchAll(/aria-pressed="(true|false)" aria-label="(\w+)"/g)].map((m) => `${m[2]}:${m[1]}`);
    expect(pressed.slice(0, 7)).toEqual([
      "Monday:true",
      "Tuesday:false",
      "Wednesday:true",
      "Thursday:false",
      "Friday:true",
      "Saturday:true",
      "Sunday:true",
    ]);
  });

  it("offers Auto and the common zones, and keeps a saved zone that is not listed", () => {
    let out = render();
    expect(out).toMatch(/<option value="auto" selected="">Auto \(detected from your browser\)<\/option>/);
    expect(out).toContain('<option value="Asia/Kolkata">Asia/Kolkata</option>');
    overrides = { timezone: "Asia/Kathmandu" };
    out = render();
    expect(out).toMatch(/<option value="Asia\/Kathmandu" selected="">Asia\/Kathmandu<\/option>/);
  });

  it("shows the natural timing switch with its helper text", () => {
    const out = render();
    expect(out).toContain("Natural timing");
    expect(out).toContain("Each post goes out up to 2 minutes after its slot so it does not look scheduled.");
    expect(out).toMatch(/id="natural-timing"[^>]*aria-checked="true"|aria-checked="true"[^>]*id="natural-timing"/);
    overrides = { naturalTiming: false };
    expect(render()).toMatch(/id="natural-timing"[^>]*aria-checked="false"/);
  });

  it("vacation off: switch off, helper shown, no date inputs", () => {
    const out = render();
    expect(out).toContain("Vacation mode");
    expect(out).toContain(
      "Pauses all posting. Posts queued inside these dates move to the first open slots after, in the same order."
    );
    expect(out).toMatch(/id="vacation-mode"[^>]*aria-checked="false"/);
    expect(out).not.toContain('type="date"');
    expect(out).not.toContain("Paused until");
  });

  it("vacation on: switch on, From and To dates and the Paused until line", () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    overrides = { timezone: "UTC", vacation: { from: now - day, to: now + 3 * day } };
    const out = render();
    expect(out).toMatch(/id="vacation-mode"[^>]*aria-checked="true"/);
    expect(out).toContain('id="vacation-from"');
    expect(out).toContain('id="vacation-to"');
    expect(out).toContain('type="date"');
    expect(out).toMatch(/Paused until (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}/);
  });

  it("treats a vacation that is already over as off", () => {
    overrides = { timezone: "UTC", vacation: { from: 1000, to: 2000 } };
    const out = render();
    expect(out).toMatch(/id="vacation-mode"[^>]*aria-checked="false"/);
    expect(out).not.toContain('type="date"');
  });

  it("has a polite status region and a loading line until settings arrive", () => {
    expect(render()).toContain('aria-live="polite"');
    loaded = false;
    expect(render()).toContain("Loading posting slots");
  });
});
