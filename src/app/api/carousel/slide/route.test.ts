import { describe, expect, it } from "vitest";
import { POST } from "./route";

const slide = { layout: "cover", tone: "coral", kicker: "Tip", headline: "Stop cross-posting.", accent: "posting.", sub: "One idea. Written twice." };

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/carousel/slide", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

describe("POST /api/carousel/slide", () => {
  it("draws one slide as a 1080 x 1350 PNG, never cached", async () => {
    const res = await post({ slide, index: 0, total: 6 });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const bytes = new Uint8Array(await res.arrayBuffer());
    // PNG signature, then the IHDR chunk holds the width and height.
    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    expect(view.getUint32(16)).toBe(1080);
    expect(view.getUint32(20)).toBe(1350);
    expect(bytes.length).toBeGreaterThan(10_000);
  }, 60_000);

  it("draws every layout", async () => {
    const layouts = [
      { layout: "cards", tone: "ink", headline: "Two cards", cards: [{ text: "One", tone: "cream" }, { text: "Two", tone: "yellow" }] },
      { layout: "list", tone: "blue", headline: "Steps", items: [{ label: "A", text: "First" }, { text: "Second" }] },
      { layout: "close", tone: "pink", headline: "Follow along.", sub: "Building in public.", pills: ["Follow", "Save"] },
      { layout: "statement", tone: "yellow", kicker: "Fun fact", headline: "A 10-slide carousel counts as one post.", accent: "10-slide", sub: "Ten slides, one tick.", tag: "Build in public" },
    ];
    for (const s of layouts) {
      const res = await post({ slide: s, index: 1, total: 4 });
      expect(res.status, s.layout).toBe(200);
    }
  }, 120_000);

  it("refuses a slide past the limits, with the reason", async () => {
    const res = await post({ slide: { ...slide, headline: "x".repeat(100) }, index: 0, total: 6 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/headline/);
  });

  it("draws a one-slide carousel (a single statement image)", async () => {
    const res = await post({ slide: { layout: "statement", tone: "blue", kicker: "Docs, checked", headline: "Docs say 100. The page says 50.", accent: "100|50.", sub: "I choose the higher one.", tag: "Build in public" }, index: 0, total: 1 });
    expect(res.status).toBe(200);
  }, 60_000);

  it("draws every layout in the Kraft zine theme, with a note, a figure and a terminal card", async () => {
    const kraft = [
      { layout: "cover", tone: "cream", kicker: "The guide, in seven slides", headline: "Price is positioning, not math", accent: "not math", sub: "Most SaaS is underpriced.", note: "underpriced" },
      { layout: "cards", tone: "yellow", kicker: "THE RECEIPT", headline: "Between cost and value", accent: "value", note: "not 50%", cards: [{ label: "HEURISTIC", big: "10-20%", text: "Rough price as a share of value.", tone: "cream" }, { label: "plan", text: "$ notice 60 days\n$ explain why", tone: "ink" }] },
      { layout: "list", tone: "ink", kicker: "STEP 1", headline: "Metric first", items: [{ label: "Metric", text: "What you charge for." }, { text: "What sits in each tier." }] },
      { layout: "close", tone: "coral", kicker: "NEXT", headline: "Test one change", sub: "Fix one.", pills: ["Follow", "Save", "Share"] },
      { layout: "statement", tone: "blue", kicker: "Fun fact", headline: "A carousel counts as one post.", accent: "one post.", sub: "Ten slides, one tick.", tag: "Build in public" },
    ];
    for (const [i, s] of kraft.entries()) {
      const res = await post({ slide: s, index: i, total: 5, theme: "kraft-zine" });
      expect(res.status, s.layout).toBe(200);
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(bytes.length).toBeGreaterThan(20_000);
    }
  }, 180_000);

  it("draws the same slide differently in each theme, and refuses an unknown theme", async () => {
    const solo = new Uint8Array(await (await post({ slide, index: 0, total: 6 })).arrayBuffer());
    const named = new Uint8Array(await (await post({ slide, index: 0, total: 6, theme: "solo-queue" })).arrayBuffer());
    const kraft = new Uint8Array(await (await post({ slide, index: 0, total: 6, theme: "kraft-zine" })).arrayBuffer());
    expect(Buffer.from(named).equals(Buffer.from(solo))).toBe(true);
    expect(Buffer.from(kraft).equals(Buffer.from(solo))).toBe(false);
    const res = await post({ slide, index: 0, total: 6, theme: "neon" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/theme/);
  }, 120_000);

  it("refuses a bad body, a bad count and a slide number past the end", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post({ slide, index: 0, total: 0 })).status).toBe(400);
    expect((await post({ slide, index: 0, total: 11 })).status).toBe(400);
    expect((await post({ slide, index: 5, total: 4 })).status).toBe(400);
  });

  it("refuses a page on another site, and allows the app's own pages and direct calls", async () => {
    expect((await post({ slide, index: 0, total: 6 }, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await post({ slide, index: 0, total: 6 }, { "sec-fetch-site": "same-origin" })).status).toBe(200);
  }, 60_000);
});
