import { describe, expect, it, vi } from "vitest";

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({ notFound, useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/components/features/ConnectionsPanel", () => ({ default: () => null }));
vi.mock("@/components/features/SlotRulesForm", () => ({ default: () => null }));

import nextConfig from "../../../next.config";
import SettingsIndexPage from "./page";
import SettingsSectionPage from "./[section]/page";

describe("/settings", () => {
  it("renders the landing (the section list on a phone) with no server redirect", () => {
    expect(SettingsIndexPage()).toBeTruthy();
  });

  it("sends an OAuth result (?connected= or ?error=) to Connections via next.config, and never bounces Connections away", async () => {
    const rules = (await nextConfig.redirects?.()) ?? [];
    for (const key of ["connected", "error"]) {
      const rule = rules.find((r) => r.source === "/settings" && JSON.stringify(r.has).includes(key));
      expect(rule?.destination).toBe("/settings/connections");
    }
    expect(rules.some((r) => r.source === "/settings/connections")).toBe(false);
    expect(rules.find((r) => r.source === "/connections")?.destination).toBe("/settings/connections");
  });
});

describe("/settings/[section]", () => {
  it("refuses an unknown section", async () => {
    await expect(
      SettingsSectionPage({
        params: Promise.resolve({ section: "nope" }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow("NOT_FOUND");
  });

  it("renders every known section", async () => {
    for (const section of ["connections", "slots", "rules", "notifications", "voice", "pillars", "media", "billing", "data"]) {
      const out = await SettingsSectionPage({
        params: Promise.resolve({ section }),
        searchParams: Promise.resolve({}),
      });
      expect(out).toBeTruthy();
    }
  });
});
