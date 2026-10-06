import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../../convex/lib/settingsModel";

let pillars = DEFAULT_SETTINGS.pillars;
let loaded = true;
vi.mock("convex/react", () => ({
  useQuery: () => (loaded ? { ...DEFAULT_SETTINGS, pillars } : undefined),
  useMutation: () => vi.fn(),
}));
vi.mock("../../../../convex/_generated/api", () => ({
  api: { settings: { get: "settings.get", update: "settings.update" } },
}));

import PillarsSection from "./PillarsSection";

const render = () => renderToStaticMarkup(<PillarsSection />);

describe("PillarsSection", () => {
  beforeEach(() => {
    loaded = true;
    pillars = DEFAULT_SETTINGS.pillars;
  });

  it("shows the four pillars with their saved name, description, share and linked products", () => {
    const out = render();
    expect(out.match(/class="sq-card st-pillar"/g)).toHaveLength(4);
    for (const p of DEFAULT_SETTINGS.pillars) {
      expect(out).toContain(`value="${p.name.replace("&", "&amp;")}"`);
      expect(out).toContain(`var(--color-${p.color})`);
    }
    expect(out).toMatch(/id="pillar-build-share"[^>]*value="40"/);
    expect(out).toMatch(/id="pillar-tools-share"[^>]*value="30"/);
    expect(out).toContain("What I shipped, what broke, what it cost.");
    expect(out).toContain("<span>flofield</span>");
    expect(out).toContain('aria-label="Unlink postship"');
    expect(out).toContain("No linked product.");
  });

  it("draws one mix segment per pillar, with names and percentages, and no warning at 100", () => {
    const out = render();
    expect(out.match(/class="st-mix-seg"/g)).toHaveLength(4);
    expect(out).toContain("--st-seg-width:40%");
    expect(out).toContain("--st-seg-width:15%");
    expect(out).toContain("Total 100%");
    expect(out).toContain('aria-label="Build in public 40%, AI &amp; tools 30%, Movies &amp; series 15%, Content craft 15%"');
    expect(out).not.toContain("Shares add up to");
  });

  it("warns, without blocking, when the shares total 90", () => {
    pillars = pillars.map((p) => (p.key === "build" ? { ...p, targetShare: 30 } : p));
    const out = render();
    expect(out).toContain("Total 90%");
    expect(out).toContain("Shares add up to 90%. Posts will still be queued; the mix bar is a target.");
  });

  it("has no add or remove pillar control", () => {
    const out = render().toLowerCase();
    expect(out).not.toContain("add pillar");
    expect(out).not.toContain("remove pillar");
  });

  it("shows a loading line until settings arrive", () => {
    loaded = false;
    expect(render()).toContain("Loading content pillars");
  });
});
