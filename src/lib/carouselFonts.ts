import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The fonts a carousel slide is drawn in, read once from `assets/fonts` (static files; satori cannot use the
 * variable fonts the app loads for the screen). All are SIL Open Font License; see assets/fonts/LICENSE.md.
 * Server only.
 */
export interface CarouselFont {
  name: string;
  data: Buffer;
  weight: 400 | 500 | 700 | 800;
  style: "normal" | "italic";
}

const FILES: { name: string; file: string; weight: CarouselFont["weight"]; style: CarouselFont["style"] }[] = [
  { name: "Bricolage", file: "BricolageGrotesque-ExtraBold.woff", weight: 800, style: "normal" },
  { name: "DMSans", file: "DMSans-Regular.woff", weight: 400, style: "normal" },
  { name: "DMSans", file: "DMSans-Medium.woff", weight: 500, style: "normal" },
  { name: "DMMono", file: "DMMono-Medium.woff", weight: 500, style: "normal" },
  { name: "DMSans", file: "DMSans-Italic.woff", weight: 400, style: "italic" },
  // The Kraft zine theme's fonts (see carouselThemes): a heavy condensed headline, an italic serif accent and a marker.
  { name: "Anton", file: "Anton-Regular.woff", weight: 400, style: "normal" },
  { name: "Playfair", file: "PlayfairDisplay-BoldItalic.woff", weight: 700, style: "italic" },
  { name: "Marker", file: "PermanentMarker-Regular.woff", weight: 400, style: "normal" },
];

let cached: Promise<CarouselFont[]> | undefined;

export function loadCarouselFonts(): Promise<CarouselFont[]> {
  cached ??= Promise.all(
    FILES.map(async (f) => ({
      name: f.name,
      weight: f.weight,
      style: f.style,
      data: await readFile(join(process.cwd(), "assets", "fonts", f.file)),
    }))
  );
  cached.catch(() => {
    cached = undefined;
  });
  return cached;
}
