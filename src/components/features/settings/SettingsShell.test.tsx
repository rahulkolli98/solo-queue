import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/settings";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("convex/react", () => ({
  useQuery: (ref: unknown) => {
    const name = String(ref);
    return name.includes("listPublic")
      ? [{ platform: "threads" }, { platform: "instagram" }]
      : { slotDefaults: { threads: ["09:30", "13:00", "19:00"], instagram: ["12:00", "18:30"] }, pillars: [1, 2, 3, 4] };
  },
}));
vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    connections: { listPublic: "connections.listPublic" },
    settings: { get: "settings.get" },
  },
}));

import SettingsShell from "./SettingsShell";

function render() {
  return renderToStaticMarkup(
    <SettingsShell>
      <p>section body</p>
    </SettingsShell>
  );
}

describe("SettingsShell", () => {
  beforeEach(() => {
    pathname = "/settings";
  });

  it("has a link to every section, each deep-linkable", () => {
    const out = render();
    for (const slug of ["connections", "slots", "rules", "notifications", "voice", "pillars", "media", "billing", "data"]) {
      expect(out).toContain(`href="/settings/${slug}"`);
    }
  });

  it("marks only the open section as current, and shows the section list on /settings", () => {
    expect(render()).toContain('data-view="index"');
    expect(render()).not.toContain("aria-current");

    pathname = "/settings/slots";
    const out = render();
    expect(out).toContain('data-view="section"');
    expect(out.match(/aria-current="page"/g)).toHaveLength(1);
    expect(out).toMatch(/aria-current="page"[^>]*>.{0,40}Posting slots/);
    expect(out).toContain("section body");
  });

  it("treats an unknown /settings/<x> as a section view, so its not-found message is not hidden on a phone", () => {
    pathname = "/settings/typo";
    const out = render();
    expect(out).toContain('data-view="section"');
    expect(out).not.toContain('aria-current="page"');
  });

  it("shows live counts beside Connections, Posting slots and Content pillars", () => {
    const out = render();
    expect(out).toContain(">2<");
    expect(out).toContain("5/DAY");
    expect(out).toContain(">4<");
  });

  it("keeps Plan & billing a static Solo card", () => {
    expect(render()).toContain("Solo · personal");
  });
});
