import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../../convex/lib/settingsModel";

let rules: Record<string, unknown> = {};
let loaded = true;
vi.mock("convex/react", () => ({
  useQuery: () => (loaded ? { ...DEFAULT_SETTINGS, rules } : undefined),
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("../../../../convex/_generated/api", () => ({
  api: { settings: { get: "settings.get", update: "settings.update" } },
}));

import QueueRulesSection from "./QueueRulesSection";

const render = () => renderToStaticMarkup(<QueueRulesSection />);
const switchState = (out: string, id: string) =>
  new RegExp(`id="${id}"[^>]*aria-checked="(true|false)"`).exec(out)?.[1];

describe("QueueRulesSection", () => {
  beforeEach(() => {
    loaded = true;
    rules = { ...DEFAULT_SETTINGS.rules };
  });

  it("shows the three switches with their saved state and helper text", () => {
    rules = { ...rules, mixPillars: true, oneReelPerDay: false, pauseOnFailure: true };
    const out = render();
    expect(out).toContain("Mix pillars");
    expect(out).toContain("Never two posts from the same pillar in a row when the queue fills slots.");
    expect(out).toContain("One reel a day");
    expect(out).toContain("Pause on failure");
    expect(out).toContain("Hold the queue if a post fails to publish, until you retry or cancel it.");
    expect(switchState(out, "rule-mixPillars")).toBe("true");
    expect(switchState(out, "rule-oneReelPerDay")).toBe("false");
    expect(switchState(out, "rule-pauseOnFailure")).toBe("true");
  });

  it("shows the evergreen select with the saved value, and a saved value that is not listed", () => {
    let out = render();
    expect(out).toContain("Requeue evergreen posts after this many days.");
    for (const n of [7, 14, 21, 30, 45, 60, 90]) expect(out).toContain(`>${n} days</option>`);
    expect(out).toMatch(/<option value="30" selected="">30 days<\/option>/);
    rules = { ...rules, evergreenRestDays: 10 };
    out = render();
    expect(out).toMatch(/<option value="10" selected="">10 days<\/option>/);
  });

  it("shows the two daily cap number inputs bounded by Meta's limits", () => {
    const out = render();
    expect(out).toMatch(/id="cap-threads"[^>]*max="250"/);
    expect(out).toMatch(/id="cap-instagram"[^>]*max="100"/);
    expect(out).toMatch(/id="cap-threads"[^>]*min="1"/);
    expect(out).toMatch(/id="cap-threads"[^>]*value="5"/);
    expect(out).toMatch(/id="cap-instagram"[^>]*value="3"/);
    expect(out).toContain("type=\"number\"");
    expect(out).toContain("Stay well under Meta&#x27;s limits (Threads 250, Instagram 100).");
  });

  it("does not render a fill-gaps control", () => {
    const out = render().toLowerCase();
    expect(out).not.toContain("fill gaps");
    expect(out).not.toContain("fillgaps");
    expect(out).not.toContain("fill-gaps");
  });

  it("has a polite status region and a loading line until settings arrive", () => {
    expect(render()).toContain('aria-live="polite"');
    loaded = false;
    expect(render()).toContain("Loading queue rules");
  });
});
