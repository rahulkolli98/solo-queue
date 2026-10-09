import type { CSSProperties, ReactElement } from "react";
import {
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  headlineSize,
  pageLabel,
  splitHeadline,
  type Slide,
  type SlideCard,
} from "../../../convex/lib/carouselSlides";
import { CARD_COLORS, CARD_SHADOW, PALETTE, SLIDE_COLORS, pillColors } from "@/lib/carouselPalette";

/**
 * One carousel slide as 1080 x 1350 markup. It is drawn by `next/og` (satori) on the server, so it sticks to what
 * satori supports: flexbox only, inline styles, every element with several children is `display: flex`. The font
 * names are the ones the image route registers (`carouselFonts.ts`).
 */
export const FONT = {
  headline: "Bricolage",
  body: "DMSans",
  mono: "DMMono",
} as const;

const PAD_X = 80;

const mono = (size: number, color: string, extra: CSSProperties = {}): CSSProperties => ({
  display: "flex",
  fontFamily: FONT.mono,
  fontWeight: 500,
  fontSize: size,
  letterSpacing: size * 0.075,
  textTransform: "uppercase",
  color,
  ...extra,
});

function Headline({ slide }: { slide: Slide }): ReactElement {
  const colors = SLIDE_COLORS[slide.tone];
  const size = headlineSize(slide.layout, slide.headline);
  const lines = splitHeadline(slide.headline, slide.accent);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {lines.map((words, li) => (
        <div
          key={li}
          style={{
            display: "flex",
            flexWrap: "wrap",
            fontFamily: FONT.headline,
            fontWeight: 800,
            fontSize: size,
            lineHeight: 0.96,
            letterSpacing: -size * 0.062,
          }}
        >
          {words.map((w, i) => (
            <span
              key={i}
              style={{
                display: "flex",
                color: w.accent ? colors.accent : colors.text,
                marginRight: w.joined ? 0 : size * 0.19,
              }}
            >
              {w.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function Sub({ slide, size = 64 }: { slide: Slide; size?: number }): ReactElement | null {
  if (!slide.sub) return null;
  // The italic line is DM Sans Italic (the app's own subtext style). It runs wider than a serif, so it is set smaller.
  const px = Math.round(size * 0.8);
  return (
    <div
      style={{
        display: "flex",
        fontFamily: FONT.body,
        fontStyle: "italic",
        fontWeight: 400,
        fontSize: px,
        lineHeight: 1.26,
        letterSpacing: -px * 0.02,
        color: slide.layout === "cover" || slide.tone !== "ink" ? PALETTE.ink : PALETTE.cream,
      }}
    >
      {slide.sub}
    </div>
  );
}

function Card({ card, row, tilt }: { card: SlideCard; row: boolean; tilt: number }): ReactElement {
  const c = CARD_COLORS[card.tone];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: row ? 432 : "100%",
        padding: row ? "40px 40px 44px" : "40px 44px 44px",
        borderRadius: 40,
        backgroundColor: c.bg,
        boxShadow: CARD_SHADOW,
        transform: `rotate(${tilt}deg)`,
      }}
    >
      {card.label && <div style={mono(26, c.label, { marginBottom: card.big ? 14 : 18 })}>{card.label}</div>}
      {card.big && (
        <div
          style={{
            display: "flex",
            fontFamily: FONT.headline,
            fontWeight: 800,
            fontSize: 112,
            lineHeight: 1,
            letterSpacing: -6,
            color: c.big,
            marginBottom: 10,
          }}
        >
          {card.big}
        </div>
      )}
      <div
        style={{
          display: "flex",
          fontFamily: FONT.body,
          fontWeight: 400,
          fontSize: row ? 36 : 42,
          lineHeight: 1.3,
          letterSpacing: -1,
          color: c.text,
        }}
      >
        {card.text}
      </div>
    </div>
  );
}

function Cards({ slide }: { slide: Slide }): ReactElement | null {
  const cards = slide.cards ?? [];
  if (cards.length === 0) return null;
  const row = cards.length === 2 && cards.every((c) => c.big);
  const tilts = [-1.2, 1, -0.8];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: row ? "row" : "column",
        justifyContent: "space-between",
        alignItems: row ? "flex-start" : "stretch",
        gap: row ? 0 : 44,
        width: "100%",
      }}
    >
      {cards.map((card, i) => (
        <div key={i} style={{ display: "flex", marginTop: row && i === 1 ? 56 : 0, width: row ? 432 : "100%" }}>
          <Card card={card} row={row} tilt={tilts[i % tilts.length]} />
        </div>
      ))}
    </div>
  );
}

function List({ slide }: { slide: Slide }): ReactElement | null {
  const items = slide.items ?? [];
  if (items.length === 0) return null;
  const colors = SLIDE_COLORS[slide.tone];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 34, width: "100%" }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 36 }}>
          <div
            style={{
              display: "flex",
              fontFamily: FONT.headline,
              fontWeight: 800,
              fontSize: 96,
              lineHeight: 0.9,
              letterSpacing: -5,
              color: colors.accent,
              minWidth: 96,
            }}
          >
            {i + 1}
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 8, paddingTop: 6 }}>
            {item.label && <div style={mono(24, colors.kicker)}>{item.label}</div>}
            <div
              style={{
                display: "flex",
                fontFamily: FONT.body,
                fontWeight: 500,
                fontSize: 44,
                lineHeight: 1.22,
                letterSpacing: -0.8,
                color: colors.text,
              }}
            >
              {item.text}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Pills({ slide }: { slide: Slide }): ReactElement {
  const pills = slide.pills?.length ? slide.pills : ["Follow", "Save", "Share"];
  const pill = pillColors(slide.tone);
  return (
    <div style={{ display: "flex", gap: 16 }}>
      {pills.map((p, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            height: 70,
            padding: "0 30px",
            borderRadius: 35,
            fontFamily: FONT.mono,
            fontWeight: 500,
            fontSize: 28,
            letterSpacing: 3,
            textTransform: "uppercase",
            ...(i === 0
              ? { backgroundColor: pill.solidBg, color: pill.solidText }
              : { border: `3px solid ${pill.outline}`, color: pill.outline }),
          }}
        >
          {p}
        </div>
      ))}
    </div>
  );
}

/** The wordmark on a statement slide. The dot is coral, except on a coral slide where it would disappear. */
export const BRAND = "solo queue";

function Wordmark({ tone }: { tone: Slide["tone"] }): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: FONT.headline,
        fontWeight: 800,
        fontSize: 42,
        letterSpacing: -2,
        color: tone === "ink" ? PALETTE.cream : PALETTE.ink,
      }}
    >
      {BRAND}
      {tone !== "coral" && <span style={{ display: "flex", color: PALETTE.coral }}>.</span>}
    </div>
  );
}

/**
 * One bold statement as a single image (the founder's one-page posts): the kicker, a big headline, an italic
 * aside that always sits in the same place, and the wordmark with a small tag along the bottom. No page number
 * or swipe arrow, because there is nothing to swipe to.
 */
function StatementSlide({ slide }: { slide: Slide }): ReactElement {
  const colors = SLIDE_COLORS[slide.tone];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        padding: `68px ${PAD_X}px 66px`,
        backgroundColor: colors.bg,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", height: 40 }}>
        <div style={mono(24, slide.tone === "ink" ? PALETTE.cream : PALETTE.ink)}>{slide.kicker ?? ""}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 76 }}>
        <Headline slide={slide} />
      </div>
      <div style={{ display: "flex", flex: 1 }} />
      <div style={{ display: "flex", alignItems: "flex-start", height: 340 }}>
        <Sub slide={slide} size={64} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 46 }}>
        <Wordmark tone={slide.tone} />
        <div style={mono(24, slide.tone === "ink" ? PALETTE.cream : PALETTE.ink)}>{slide.tag ?? ""}</div>
      </div>
    </div>
  );
}

export default function SlideView({
  slide,
  index,
  total,
}: {
  slide: Slide;
  index: number;
  total: number;
}): ReactElement {
  if (slide.layout === "statement") return <StatementSlide slide={slide} />;
  const colors = SLIDE_COLORS[slide.tone];
  const last = index >= total - 1;
  const cover = slide.layout === "cover";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        padding: `64px ${PAD_X}px 70px`,
        backgroundColor: colors.bg,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 40 }}>
        <div style={mono(26, colors.kicker)}>{slide.kicker ?? ""}</div>
        <div style={mono(26, slide.tone === "ink" ? PALETTE.cream : PALETTE.ink)}>{pageLabel(index, total)}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: cover ? 100 : 36 }}>
        <Headline slide={slide} />
      </div>

      {cover && (
        <div style={{ display: "flex", marginTop: 110 }}>
          <Sub slide={slide} size={64} />
        </div>
      )}
      {slide.layout === "close" && (
        <div style={{ display: "flex", marginTop: 90 }}>
          <Sub slide={slide} size={64} />
        </div>
      )}
      {slide.layout === "list" && (
        <div style={{ display: "flex", marginTop: 120 }}>
          <List slide={slide} />
        </div>
      )}

      <div style={{ display: "flex", flex: 1 }} />

      {slide.layout === "cards" && <Cards slide={slide} />}
      {slide.layout === "close" && <Pills slide={slide} />}
      {slide.layout === "cards" && slide.sub && (
        <div style={{ display: "flex", marginTop: 56 }}>
          <Sub slide={slide} size={56} />
        </div>
      )}

      {slide.layout !== "close" && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: cover ? 0 : 36, height: 36 }}>
          {!last && <div style={mono(26, slide.tone === "ink" ? PALETTE.yellow : PALETTE.ink)}>{cover ? "Swipe →" : "→"}</div>}
        </div>
      )}
    </div>
  );
}
