import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/settings";
let connectionRows: unknown[] = [
  { platform: "threads", handle: "@drill", status: "healthy" },
  { platform: "instagram", handle: "@drill.ig", status: "healthy" },
];
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("convex/react", () => ({
  useQuery: (ref: unknown) => {
    const name = String(ref);
    return name.includes("listPublic")
      ? connectionRows
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
    connectionRows = [
      { platform: "threads", handle: "@drill", status: "healthy" },
      { platform: "instagram", handle: "@drill.ig", status: "healthy" },
    ];
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
    // One in the flat desktop list and one in the grouped phone list; CSS shows the one that fits.
    expect(out.match(/aria-current="page"/g)).toHaveLength(2);
    expect(out.match(/aria-current="page"[^>]*>.{0,40}Posting slots/g)).toHaveLength(2);
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

  it("groups the phone list Accounts / Posting / Writing / You while the desktop list stays flat", () => {
    const out = render();
    const flat = out.slice(out.indexOf("st-nav-flat"), out.indexOf("st-nav-groups"));
    const flatOrder = [...flat.matchAll(/href="\/settings\/(\w+)"/g)].map((m) => m[1]);
    expect(flatOrder).toEqual(["connections", "slots", "rules", "notifications", "voice", "pillars", "media", "billing", "data"]);

    const grouped = out.slice(out.indexOf("st-nav-groups"));
    const titles = [...grouped.matchAll(/st-group-title">(\w+)</g)].map((m) => m[1]);
    expect(titles).toEqual(["Accounts", "Posting", "Writing", "You"]);
    const groupedOrder = [...grouped.matchAll(/href="\/settings\/(\w+)"/g)].map((m) => m[1]);
    expect(groupedOrder).toEqual(["connections", "media", "slots", "rules", "pillars", "voice", "notifications", "billing", "data"]);
    expect(out.match(/class="st-group-card"/g)).toHaveLength(4);
  });

  it("opens a section with a back button that names the way back", () => {
    pathname = "/settings/rules";
    const out = render();
    expect(out).toMatch(/<a class="st-back"[^>]*aria-label="Back to settings"[^>]*href="\/settings"/);
    expect(out).toContain("SETTINGS");
  });

  it("puts a Posting as card with the handles and the health at the top of the phone list", () => {
    const out = render();
    expect(out).toContain('aria-label="Posting as"');
    expect(out).toContain("@drill");
    expect(out).toContain("@drill.ig");
    expect(out).toContain("● ALL HEALTHY");
  });

  it("says when a connection needs attention, and leaves the card out when nothing is connected", () => {
    connectionRows = [{ platform: "threads", handle: "@drill", status: "failed" }];
    expect(render()).toContain("● NEEDS ATTENTION");
    connectionRows = [];
    expect(render()).not.toContain('aria-label="Posting as"');
  });
});
