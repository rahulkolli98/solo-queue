/**
 * The hand-made shapes of the Kraft zine theme, as SVG path data: a strip of torn tape, a scribbled circle round a
 * figure, a small curved arrow, a piece of masking tape. Each takes a seed (the text it decorates), so the same slide
 * is always drawn the same way but two slides never look stamped from one mould. Pure and unit tested.
 */

/** A small stable number from some text (FNV-1a). */
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A seeded random number generator (mulberry32): the same seed gives the same sequence. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * The outline of a strip of tape `w` x `h`: straight top and bottom with a hairline wobble, and the short ends torn
 * into a jagged edge (up to `tear` px deep). Returns `points` for an SVG polygon.
 */
export function tornStripPoints(w: number, h: number, seed: number, tear = 9): string {
  const rand = rng(seed);
  const steps = Math.max(4, Math.round(h / 12));
  const pts: [number, number][] = [];
  // top edge, left to right
  pts.push([rand() * tear, 0]);
  for (let x = w * 0.25; x < w; x += w * 0.25) pts.push([x, rand() * 1.6]);
  // right edge, top to bottom (torn)
  for (let i = 0; i <= steps; i += 1) pts.push([w - rand() * tear, (h * i) / steps]);
  // bottom edge, right to left
  for (let x = w * 0.75; x > 0; x -= w * 0.25) pts.push([x, h - rand() * 1.6]);
  // left edge, bottom to top (torn)
  for (let i = steps; i >= 0; i -= 1) pts.push([rand() * tear, (h * i) / steps]);
  return pts.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");
}

/**
 * A scribbled circle round a `w` x `h` box: the pen goes round a little more than once, drifts outward as it goes and
 * wobbles, the way a circle drawn quickly with a marker closes. Returns path data for an SVG path with no fill.
 */
export function scribbleCirclePath(w: number, h: number, seed: number): string {
  const rand = rng(seed);
  const phase = rand() * Math.PI * 2;
  const wobble = 0.02 + rand() * 0.02;
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2 - 8;
  const ry = h / 2 - 8;
  const turns = 1.12;
  const steps = 64;
  const start = -Math.PI * 0.55 + (rand() - 0.5) * 0.4;
  let d = "";
  for (let i = 0; i <= steps; i += 1) {
    const f = i / steps;
    const t = start + f * turns * Math.PI * 2;
    // Drift outward so the end overshoots the start, and wobble the radius a little.
    const r = 0.96 + 0.07 * f + wobble * Math.sin(3 * t + phase);
    const x = cx + rx * r * Math.cos(t);
    const y = cy + ry * r * Math.sin(t);
    d += `${i === 0 ? "M" : "L"}${round(x)} ${round(y)} `;
  }
  return d.trim();
}

/** A curved arrow from the top right of a `w` x `h` box down to its bottom left, with a two-stroke head. */
export function arrowPath(w: number, h: number): string {
  const tipX = 6;
  const tipY = h - 6;
  const body = `M${round(w - 6)} 6 C${round(w * 0.78)} ${round(h * 0.08)} ${round(w * 0.2)} ${round(h * 0.22)} ${tipX} ${tipY}`;
  const head = `M${tipX + 2} ${tipY - 22} L${tipX} ${tipY} L${tipX + 26} ${tipY - 6}`;
  return `${body} ${head}`;
}

/** A wavy underline `w` px long, as path data. */
export function underlinePath(w: number, seed: number): string {
  const rand = rng(seed);
  const amp = 2.5 + rand() * 1.5;
  let d = `M2 ${round(6 + rand() * 2)}`;
  const steps = Math.max(2, Math.round(w / 30));
  for (let i = 1; i <= steps; i += 1) {
    const x = (w * i) / steps;
    d += ` Q${round(x - w / steps / 2)} ${round(6 + (i % 2 === 0 ? amp : -amp))} ${round(x)} ${round(6 + rand() * 2 - 1)}`;
  }
  return d;
}
