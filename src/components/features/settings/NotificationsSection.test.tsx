import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../../convex/lib/settingsModel";

let notifications: Record<string, unknown> = {};
let loaded = true;
vi.mock("convex/react", () => ({
  useQuery: () => (loaded ? { ...DEFAULT_SETTINGS, notifications } : undefined),
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("../../../../convex/_generated/api", () => ({
  api: { settings: { get: "settings.get", update: "settings.update" } },
}));

import NotificationsSection from "./NotificationsSection";

const render = () => renderToStaticMarkup(<NotificationsSection />);
const switchState = (out: string, id: string) =>
  new RegExp(`id="${id}"[^>]*aria-checked="(true|false)"`).exec(out)?.[1];

describe("NotificationsSection", () => {
  beforeEach(() => {
    loaded = true;
    notifications = { ...DEFAULT_SETTINGS.notifications };
  });

  it("shows the three Today alerts with their saved state", () => {
    notifications = { ...notifications, tokenExpiring: true, postFailed: false, queueLow: true };
    const out = render();
    expect(out).toContain("Token expiring");
    expect(out).toContain("Post failed");
    expect(out).toContain("Queue running low");
    expect(switchState(out, "note-tokenExpiring")).toBe("true");
    expect(switchState(out, "note-postFailed")).toBe("false");
    expect(switchState(out, "note-queueLow")).toBe("true");
  });

  it("keeps Post published and Sunday digest visible but unavailable, marked coming later", () => {
    const out = render();
    expect(out).toContain("Post published");
    expect(out).toContain("Sunday digest");
    expect(out.match(/Coming later/g)).toHaveLength(2);
    expect(out).toMatch(/id="note-postPublished-label"/);
    expect(out).toMatch(/role="switch" aria-checked="false"[^>]*disabled/);
  });

  it("shows saved quiet hours in the two time fields, and a Clear button only when saved", () => {
    let out = render();
    expect(out).not.toContain(">Clear<");
    notifications = { ...notifications, quietHours: "22:00-08:00" };
    out = render();
    expect(out).toContain('value="22:00"');
    expect(out).toContain('value="08:00"');
    expect(out).toContain(">Clear<");
  });

  it("says it is loading until the settings arrive", () => {
    loaded = false;
    expect(render()).toContain("Loading notifications");
  });
});
