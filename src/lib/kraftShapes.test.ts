import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { arrowPath, rng, scribbleCirclePath, seedFrom, tornStripPoints, underlinePath } from "@/lib/kraftShapes";
import { KRAFT_TILE_SIZE, kraftTilePng, kraftTextureUri } from "@/lib/kraftTexture";

describe("seeds", () => {
  it("the same text gives the same seed and the same random sequence, different text a different one", () => {
    expect(seedFrom("THE RECEIPT")).toBe(seedFrom("THE RECEIPT"));
    expect(seedFrom("THE RECEIPT")).not.toBe(seedFrom("THE TIERS"));
    const a = rng(7);
    const b = rng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    for (let i = 0; i < 200; i += 1) {
      const n = rng(i)();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});

const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe("torn tape", () => {
  it("is the same every time for the same text, stays inside its box, and tears the two short ends", () => {
    const a = tornStripPoints(400, 88, seedFrom("STEP 1"));
    expect(a).toBe(tornStripPoints(400, 88, seedFrom("STEP 1")));
    expect(a).not.toBe(tornStripPoints(400, 88, seedFrom("STEP 2")));
    const pts = a.split(" ").map((p) => p.split(",").map(Number));
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(400);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(88);
    }
    // The right end is torn: its points do not all sit on the same x.
    const right = pts.filter(([x]) => x > 300 && x < 400);
    expect(new Set(right.map(([x]) => x)).size).toBeGreaterThan(2);
  });
});

describe("the scribbled circle", () => {
  it("is a path that goes round the box a little more than once and stays near it", () => {
    const d = scribbleCirclePath(500, 200, 5);
    expect(d.startsWith("M")).toBe(true);
    expect(d).toBe(scribbleCirclePath(500, 200, 5));
    expect(d).not.toBe(scribbleCirclePath(500, 200, 6));
    const n = numbers(d);
    const xs = n.filter((_, i) => i % 2 === 0);
    const ys = n.filter((_, i) => i % 2 === 1);
    // It overshoots the box a little (drifts outward), never by much.
    expect(Math.min(...xs)).toBeGreaterThan(-30);
    expect(Math.max(...xs)).toBeLessThan(530);
    expect(Math.min(...ys)).toBeGreaterThan(-30);
    expect(Math.max(...ys)).toBeLessThan(230);
    expect(xs.length).toBeGreaterThan(60);
  });
});

describe("the arrow and the underline", () => {
  it("are paths: the arrow ends at the bottom left with a head, the underline spans its width", () => {
    const arrow = arrowPath(100, 80);
    expect(arrow.startsWith("M")).toBe(true);
    expect(arrow).toContain("C");
    expect(arrow.split("M").length).toBe(3);
    const u = underlinePath(300, 3);
    expect(u.startsWith("M")).toBe(true);
    expect(Math.max(...numbers(u))).toBeGreaterThanOrEqual(290);
  });
});

describe("the paper grain", () => {
  it("is a valid RGBA PNG of the stated size, mostly transparent, made once", () => {
    const png = kraftTilePng();
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.readUInt32BE(16)).toBe(KRAFT_TILE_SIZE);
    expect(png.readUInt32BE(20)).toBe(KRAFT_TILE_SIZE);
    expect(png[24]).toBe(8);
    expect(png[25]).toBe(6);
    // Read the pixels back: the grain is faint, so the average opacity stays low.
    const idat = png.indexOf(Buffer.from("IDAT"));
    const length = png.readUInt32BE(idat - 4);
    const raw = inflateSync(png.subarray(idat + 4, idat + 4 + length));
    expect(raw.length).toBe((KRAFT_TILE_SIZE * 4 + 1) * KRAFT_TILE_SIZE);
    let alpha = 0;
    for (let y = 0; y < KRAFT_TILE_SIZE; y += 1) {
      for (let x = 0; x < KRAFT_TILE_SIZE; x += 1) alpha += raw[y * (KRAFT_TILE_SIZE * 4 + 1) + 1 + x * 4 + 3];
    }
    expect(alpha / (KRAFT_TILE_SIZE * KRAFT_TILE_SIZE)).toBeLessThan(40);
    expect(kraftTextureUri()).toBe(kraftTextureUri());
    expect(kraftTextureUri().startsWith("data:image/png;base64,")).toBe(true);
  });
});
