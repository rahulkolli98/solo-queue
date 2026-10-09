import { deflateSync } from "node:zlib";
import { rng } from "@/lib/kraftShapes";

/**
 * The kraft paper grain: one small seamless tile (a faint fibre grain, blotches and a few flecks) made in code, so no
 * image file has to be kept in the repository. It is a PNG with transparency that sits over the paper colour and is
 * repeated across the slide. Server only (node:zlib); made once and kept.
 */

const SIZE = 192;

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A smooth, tileable noise field in 0..1 (value noise on a wrapping grid, smoothly interpolated). */
function smoothNoise(grid: number, seed: number): (x: number, y: number) => number {
  const rand = rng(seed);
  const cells = Array.from({ length: grid * grid }, () => rand());
  const at = (x: number, y: number) => cells[(((y % grid) + grid) % grid) * grid + (((x % grid) + grid) % grid)];
  const ease = (t: number) => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = u * grid;
    const y = v * grid;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = ease(x - x0);
    const fy = ease(y - y0);
    const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
    const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
    return top * (1 - fy) + bottom * fy;
  };
}

/** The PNG bytes of the tile: dark and light specks over transparent, RGBA 8-bit. */
export function kraftTilePng(): Buffer {
  const rand = rng(0x6b7261);
  const blotch = smoothNoise(3, 11);
  const fibre = smoothNoise(48, 29);
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    const row = y * (SIZE * 4 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < SIZE; x += 1) {
      const u = x / SIZE;
      const v = y / SIZE;
      const b = blotch(u, v) - 0.5; // very slow, faint blotches
      const f = fibre(u * 3.0, v * 3.0) - 0.5; // fine, even fibres
      const grain = rand() - 0.5;
      const dark = Math.max(0, -(b * 0.25 + f * 0.7 + grain * 1.0));
      const light = Math.max(0, b * 0.25 + f * 0.5 + grain * 0.8);
      const i = row + 1 + x * 4;
      if (dark >= light) {
        raw[i] = 70;
        raw[i + 1] = 44;
        raw[i + 2] = 18;
        raw[i + 3] = Math.min(255, Math.round(dark * 70));
      } else {
        raw[i] = 255;
        raw[i + 1] = 246;
        raw[i + 2] = 226;
        raw[i + 3] = Math.min(255, Math.round(light * 60));
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export const KRAFT_TILE_SIZE = SIZE;

let cached: string | undefined;

/** The tile as a data URI, made once. */
export function kraftTextureUri(): string {
  cached ??= `data:image/png;base64,${kraftTilePng().toString("base64")}`;
  return cached;
}
