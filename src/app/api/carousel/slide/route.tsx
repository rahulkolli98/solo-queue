import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { z } from "zod";
import SlideView from "@/components/carousel/SlideView";
import { loadCarouselFonts } from "@/lib/carouselFonts";
import { MAX_SLIDES, MIN_SLIDES, SLIDE_HEIGHT, SLIDE_WIDTH, validateSlide } from "../../../../../convex/lib/carouselSlides";
import { isThemeKey } from "../../../../../convex/lib/themes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  slide: z.unknown(),
  index: z.number().int().min(0).max(MAX_SLIDES - 1),
  total: z.number().int().min(MIN_SLIDES).max(MAX_SLIDES),
  /** The design to draw in (themes.ts); missing is Solo Queue. */
  theme: z.string().optional(),
});

const NO_STORE = { "Cache-Control": "no-store" };

function problem(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

/**
 * Draws one carousel slide as a 1080 x 1350 PNG. POST `{ slide, index, total, theme? }`; the slide is checked against the
 * same limits the editor uses. The proxy puts this route behind Basic Auth like the rest of the app, and a page on
 * another site cannot call it with the operator's cached login.
 */
export async function POST(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return problem("Forbidden.", 403);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return problem("Send the slide as JSON.", 400);
  }
  const body = bodySchema.safeParse(json);
  if (!body.success) return problem("Send { slide, index, total } with 1 to 10 slides.", 400);
  if (body.data.index >= body.data.total) return problem("That slide number is past the end of the carousel.", 400);
  const checked = validateSlide(body.data.slide);
  if (!checked.ok) return problem(checked.message, 400);
  if (body.data.theme !== undefined && !isThemeKey(body.data.theme)) return problem("That theme is not available.", 400);

  const element = <SlideView slide={checked.slide} index={body.data.index} total={body.data.total} theme={body.data.theme} />;
  try {
    const fonts = await loadCarouselFonts();
    return new ImageResponse(element, {
      width: SLIDE_WIDTH,
      height: SLIDE_HEIGHT,
      fonts,
      headers: NO_STORE,
    });
  } catch (err) {
    console.error("carousel slide:", err instanceof Error ? err.message : err);
    return problem("Could not draw that slide. Try again.", 500);
  }
}
