import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../../convex/lib/settingsModel";

let media: Record<string, unknown> = {};
let loaded = true;
let summary: { files: number; bytes: number } | undefined;
vi.mock("convex/react", () => ({
  useQuery: (ref: string) =>
    ref === "media.storageSummary" ? summary : loaded ? { ...DEFAULT_SETTINGS, media } : undefined,
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    settings: { get: "settings.get", update: "settings.update" },
    media: { storageSummary: "media.storageSummary" },
  },
}));

import MediaSection from "./MediaSection";

const render = () => renderToStaticMarkup(<MediaSection />);

describe("MediaSection", () => {
  beforeEach(() => {
    loaded = true;
    media = { ...DEFAULT_SETTINGS.media };
    summary = { files: 3, bytes: 12.4 * 1024 * 1024 };
  });

  it("shows Solo Queue hosting selected and the own bucket disabled, marked coming later", () => {
    const out = render();
    expect(out).toContain("Solo Queue hosting");
    expect(out).toContain(
      "Files are stored on your own Solo Queue backend and served on public links Meta can fetch."
    );
    expect(out).toContain("Your own bucket");
    expect(out).toContain("S3 · R2");
    expect(out).toContain("● IN USE");
    expect(out.match(/Coming later/g)).toHaveLength(1);
    const inputs = out.match(/<input type="radio"[^>]*>/g) ?? [];
    expect(inputs).toHaveLength(2);
    const solo = inputs.find((i) => i.includes('value="solo"')) ?? "";
    const bucket = inputs.find((i) => i.includes('value="bucket"')) ?? "";
    expect(solo).toContain('checked=""');
    expect(solo).not.toContain("disabled");
    expect(bucket).toContain('disabled=""');
    expect(bucket).not.toContain("checked");
  });

  it("shows the storage meter from the summary, scaled to 1 GB", () => {
    const out = render();
    expect(out).toContain("3 files, 12 MB used");
    expect(out).toContain("of 1 GB on the free plan");
    expect(out).toContain("--st-meter:1.2%");
  });

  it("says it is checking storage until the summary arrives", () => {
    summary = undefined;
    const out = render();
    expect(out).toContain("Checking storage");
    expect(out).not.toContain("MB used");
  });

  it("shows the tidy-up select with Off, the choices and the saved value", () => {
    let out = render();
    expect(out).toContain("Tidy up after posting");
    expect(out).toContain("Deletes the hosted file once every post that uses it has been published for this long.");
    expect(out).toMatch(/<option value="off" selected="">Off \(keep files\)<\/option>/);
    for (const n of [7, 14, 30]) expect(out).toContain(`${n} days after the post is published</option>`);
    media = { ...media, cleanupAfterDays: 14 };
    out = render();
    expect(out).toMatch(/<option value="14" selected="">14 days after the post is published<\/option>/);
    expect(out).not.toMatch(/<option value="off" selected/);
  });

  it("has no image crop control", () => {
    const out = render();
    expect(out).not.toMatch(/crop/i);
    expect(out).not.toContain("4:5");
  });

  it("says it is loading until the settings arrive", () => {
    loaded = false;
    expect(render()).toContain("Loading media settings");
  });
});
