import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/components/PublisherStatus", () => ({ default: () => null }));

import MobileHeader from "@/components/MobileHeader";

const render = (path: string) => {
  pathname = path;
  return renderToStaticMarkup(<MobileHeader />);
};

describe("MobileHeader", () => {
  beforeEach(() => {
    pathname = "/";
  });

  it("shows the wordmark on Today", () => {
    const out = render("/");
    expect(out).toContain('data-home="true"');
    expect(out).not.toContain("sq-mobile-title");
  });

  it("shows the screen name instead of the wordmark on a named screen", () => {
    const out = render("/log");
    expect(out).toContain('data-home="false"');
    expect(out).toContain("Publishing log");
  });

  it("keeps the wordmark on a route with no name of its own (the 404 page)", () => {
    const out = render("/nope");
    expect(out).toContain('data-home="true"');
    expect(out).not.toContain("sq-mobile-title");
  });
});
