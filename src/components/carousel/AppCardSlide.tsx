import type { CSSProperties, ReactElement, ReactNode } from "react";
import { SLIDE_HEIGHT, SLIDE_WIDTH, splitHeadline, type Slide } from "../../../convex/lib/carouselSlides";
import { appCardColors, type AppCardColors } from "@/lib/appCardPalette";
import {
  APP_PAD_BOTTOM,
  APP_PAD_TOP,
  APP_PAD_X,
  BADGE_H,
  HEAD_TRACK,
  PILL_H,
  appHeadlineSize,
  appRows,
  fitAppCard,
  type AppSizes,
} from "@/lib/carouselAppFit";

/**
 * One slide in the App card theme: a very light grey page, white rounded rows, heavy near-black titles, muted grey
 * descriptions and one blue accent, as in the founder's "N apps to install" reference. Drawn by satori like the other
 * themes (flexbox only, inline styles, every element with several children is `display: flex`). It is built for a
 * cover, one item per slide and a closing question; it cannot draw the references' photos or app icons.
 */
const FONT = { title: "Bricolage", body: "DMSans" } as const;

function Headline({ slide, size, c }: { slide: Slide; size: number; c: AppCardColors }): ReactElement {
  const lines = splitHeadline(slide.headline, slide.accent);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {lines.map((words, li) => (
        <div
          key={li}
          style={{ display: "flex", flexWrap: "wrap", fontFamily: FONT.title, fontWeight: 800, fontSize: size, lineHeight: 1.02, letterSpacing: HEAD_TRACK * size }}
        >
          {words.map((w, i) => (
            <span key={i} style={{ display: "flex", color: w.accent ? c.blue : c.ink, marginRight: w.joined ? 0 : size * 0.2 }}>
              {w.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function Pill({ text, c, accent }: { text: string; c: AppCardColors; accent?: boolean }): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: PILL_H,
        padding: "0 28px",
        borderRadius: PILL_H / 2,
        backgroundColor: c.card,
        boxShadow: c.cardShadow,
        fontFamily: FONT.body,
        fontWeight: 500,
        fontSize: 30,
        color: accent ? c.blue : c.ink,
      }}
    >
      {text}
    </div>
  );
}

/** The top row: the topic tag on the left, and on the right either the item counter or a second pill. */
function TopRow({ left, right, c }: { left?: string; right?: ReactElement | null; c: AppCardColors }): ReactElement {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: PILL_H }}>
      {left ? <Pill text={left} c={c} accent /> : <div style={{ display: "flex" }} />}
      {right ?? <div style={{ display: "flex" }} />}
    </div>
  );
}

const muted = (c: AppCardColors, size: number, extra: CSSProperties = {}): CSSProperties => ({
  display: "flex",
  fontFamily: FONT.body,
  fontWeight: 400,
  fontSize: size,
  lineHeight: 1.25,
  letterSpacing: -size * 0.01,
  color: c.muted,
  ...extra,
});

function Frame({ c, children, background }: { c: AppCardColors; children: ReactNode; background?: string }): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        position: "relative",
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        padding: `${APP_PAD_TOP}px ${APP_PAD_X}px ${APP_PAD_BOTTOM}px`,
        background: background ?? c.bg,
      }}
    >
      {children}
    </div>
  );
}

function Cover({ slide, c }: { slide: Slide; c: AppCardColors }): ReactElement {
  const size = appHeadlineSize(slide);
  // No photo here, so the top of the page is a soft grey wash that fades into the page, where the references have a photo.
  const wash = slide.tone === "ink" || slide.tone === "blue" ? c.bg : `linear-gradient(180deg, #d7d7dc 0%, #e6e6ea 38%, ${c.bg} 66%)`;
  return (
    <Frame c={c} background={wash}>
      <TopRow left={slide.tag} c={c} />
      <div style={{ display: "flex", flex: 1 }} />
      {slide.kicker && (
        <div style={{ display: "flex", fontFamily: FONT.body, fontWeight: 500, fontSize: 50, letterSpacing: -0.5, color: c.blue, marginBottom: 30 }}>{slide.kicker}</div>
      )}
      <Headline slide={slide} size={size} c={c} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 40 }}>
        <div style={muted(c, 46, { maxWidth: 620 })}>{slide.sub ?? ""}</div>
        <div style={muted(c, 42)}>Swipe →</div>
      </div>
    </Frame>
  );
}

function Rows({ slide, s, c }: { slide: Slide; s: AppSizes; c: AppCardColors }): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: s.rowGap, width: "100%" }}>
      {appRows(slide).map((row, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            padding: `${s.rowPadY}px ${s.rowPadX}px`,
            borderRadius: 34,
            backgroundColor: c.card,
            boxShadow: c.cardShadow,
          }}
        >
          {row.big ? (
            <div style={{ display: "flex", fontFamily: FONT.title, fontWeight: 800, fontSize: s.big, letterSpacing: HEAD_TRACK * s.big, color: c.blue }}>{row.big}</div>
          ) : (
            <div
              style={{
                display: "flex",
                width: s.icon,
                height: s.icon,
                borderRadius: s.icon * 0.28,
                backgroundColor: c.blue,
                opacity: 0.16,
              }}
            />
          )}
          <div style={{ display: "flex", flex: 1, fontFamily: FONT.body, fontWeight: 400, fontSize: s.rowText, lineHeight: 1.3, letterSpacing: -s.rowText * 0.01, color: c.ink }}>
            {row.text}
          </div>
        </div>
      ))}
    </div>
  );
}

/** One item: the big pale number, the name, one sentence, the rows, then a blue badge and a muted note. */
function Item({ slide, index, total, c }: { slide: Slide; index: number; total: number; c: AppCardColors }): ReactElement {
  const { sizes: s } = fitAppCard(slide);
  const n = Math.max(index, 1);
  const items = Math.max(total - 2, n);
  return (
    <Frame c={c}>
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 112,
          right: APP_PAD_X - 8,
          fontFamily: FONT.title,
          fontWeight: 800,
          fontSize: 250,
          lineHeight: 1,
          letterSpacing: -10,
          color: c.ghost,
        }}
      >
        {String(n).padStart(2, "0")}
      </div>
      <TopRow left={slide.kicker} right={<div style={muted(c, 32)}>{`${n} / ${items}`}</div>} c={c} />
      <div style={{ display: "flex", flexDirection: "column", marginTop: 60 }}>
        <Headline slide={slide} size={s.headline} c={c} />
      </div>
      {slide.sub && <div style={muted(c, s.sub, { marginTop: 24 })}>{slide.sub}</div>}
      <div style={{ display: "flex", flex: 1, minHeight: 40 }} />
      <Rows slide={slide} s={s} c={c} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: BADGE_H, marginTop: 40 }}>
        {slide.tag ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              height: BADGE_H,
              padding: "0 36px",
              borderRadius: BADGE_H / 2,
              backgroundColor: c.blue,
              color: c.onBlue,
              fontFamily: FONT.title,
              fontWeight: 800,
              fontSize: 34,
              letterSpacing: -0.5,
            }}
          >
            {slide.tag}
          </div>
        ) : (
          <div style={{ display: "flex" }} />
        )}
        <div style={muted(c, 34)}>{slide.note ?? ""}</div>
      </div>
    </Frame>
  );
}

function Close({ slide, c }: { slide: Slide; c: AppCardColors }): ReactElement {
  const size = appHeadlineSize(slide);
  const pills = slide.pills?.length ? slide.pills : ["Save this", "Follow for more"];
  return (
    <Frame c={c}>
      <TopRow left={slide.kicker} c={c} />
      <div style={{ display: "flex", flex: 1 }} />
      <Headline slide={slide} size={size} c={c} />
      {slide.sub && <div style={muted(c, 50, { marginTop: 36 })}>{slide.sub}</div>}
      <div style={{ display: "flex", gap: 18, marginTop: 56 }}>
        {pills.map((p, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              height: 84,
              padding: "0 40px",
              borderRadius: 42,
              fontFamily: FONT.title,
              fontWeight: 800,
              fontSize: 36,
              letterSpacing: -0.5,
              ...(i === 0 ? { backgroundColor: c.blue, color: c.onBlue } : { backgroundColor: c.card, color: c.ink, boxShadow: c.cardShadow }),
            }}
          >
            {p}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flex: 1 }} />
    </Frame>
  );
}

/** One bold statement filling the page, with a tag and the wordmark along the bottom. */
function Statement({ slide, c }: { slide: Slide; c: AppCardColors }): ReactElement {
  const size = appHeadlineSize(slide);
  return (
    <Frame c={c}>
      <TopRow left={slide.kicker} c={c} />
      <div style={{ display: "flex", flexDirection: "column", marginTop: 90 }}>
        <Headline slide={slide} size={size} c={c} />
      </div>
      <div style={{ display: "flex", flex: 1 }} />
      {slide.sub && <div style={muted(c, 48)}>{slide.sub}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 46, marginTop: 56 }}>
        <div style={{ display: "flex", fontFamily: FONT.title, fontWeight: 800, fontSize: 42, letterSpacing: -2, color: c.ink }}>
          solo queue<span style={{ display: "flex", color: c.blue }}>.</span>
        </div>
        <div style={muted(c, 30, { textTransform: "uppercase", letterSpacing: 2 })}>{slide.tag ?? ""}</div>
      </div>
    </Frame>
  );
}

export default function AppCardSlide({ slide, index, total }: { slide: Slide; index: number; total: number }): ReactElement {
  const c = appCardColors(slide.tone);
  if (slide.layout === "cover") return <Cover slide={slide} c={c} />;
  if (slide.layout === "close") return <Close slide={slide} c={c} />;
  if (slide.layout === "statement") return <Statement slide={slide} c={c} />;
  return <Item slide={slide} index={index} total={total} c={c} />;
}
