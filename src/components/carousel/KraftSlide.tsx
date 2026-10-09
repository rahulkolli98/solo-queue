import type { CSSProperties, ReactElement } from "react";
import { SLIDE_HEIGHT, SLIDE_WIDTH, pageLabel, splitHeadline, type Slide, type SlideCard } from "../../../convex/lib/carouselSlides";
import { KRAFT_PAD_BOTTOM, KRAFT_PAD_TOP, KRAFT_PAD_X, figureHeight, fitKraft, isTerminal, type KraftSizes } from "@/lib/carouselKraftFit";
import { textWidth } from "@/lib/carouselText";
import { arrowPath, scribbleCirclePath, seedFrom, tornStripPoints } from "@/lib/kraftShapes";
import { KRAFT } from "@/lib/kraftPalette";
import { KRAFT_TILE_SIZE, kraftTextureUri } from "@/lib/kraftTexture";

/**
 * One carousel slide in the Kraft zine theme, as 1080 x 1350 markup for satori (flexbox only, inline styles, every
 * element with several children is `display: flex`). Printed-zine look: kraft paper with a grain, a torn-tape label for
 * the kicker, a heavy condensed headline with one red italic serif phrase, paper cards held down with masking tape,
 * terminal windows for dark cards, hand-drawn circles and a hand-written note. Every size comes from `fitKraft`, so a
 * crowded slide is drawn smaller instead of running off the bottom. Font names are the ones carouselFonts.ts registers.
 */
const FONT = { head: "Anton", accent: "Playfair", hand: "Marker", body: "DMSans", mono: "DMMono" } as const;

const flex = (extra: CSSProperties = {}): CSSProperties => ({ display: "flex", ...extra });

/* ---- small pieces ---- */

/** A piece of masking tape across a corner (absolute, so the parent must be `position: relative`). */
function Tape({ left, top, rotate, w = 112, h = 38 }: { left: number; top: number; rotate: number; w?: number; h?: number }): ReactElement {
  return (
    <div style={flex({ position: "absolute", left, top, width: w, height: h, transform: `rotate(${rotate}deg)` })}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <polygon points={tornStripPoints(w, h, seedFrom(`tape${left}${top}`), 7)} fill={KRAFT.tape} stroke={KRAFT.tapeEdge} strokeWidth={1.5} />
      </svg>
    </div>
  );
}

/** A black torn-tape strip with marker lettering: the kicker, and the close slide's pills. */
function TornLabel({ text, size, height, rotate = -3 }: { text: string; size: number; height: number; rotate?: number }): ReactElement {
  const label = text.toUpperCase();
  const w = Math.round(textWidth("marker", label, size, 1) + 2 * Math.round(size * 0.8));
  return (
    <div style={flex({ position: "relative", width: w, height, transform: `rotate(${rotate}deg)` })}>
      <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} style={{ position: "absolute", left: 0, top: 0 }}>
        <polygon points={tornStripPoints(w, height, seedFrom(label))} fill={KRAFT.tapeBlack} />
      </svg>
      <div
        style={flex({
          position: "absolute",
          left: 0,
          top: 0,
          width: w,
          height,
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT.hand,
          fontSize: size,
          letterSpacing: 1,
          color: KRAFT.tapeText,
        })}
      >
        {label}
      </div>
    </div>
  );
}

function CounterPill({ index, total }: { index: number; total: number }): ReactElement {
  return (
    <div
      style={flex({
        alignItems: "center",
        height: 64,
        padding: "0 30px",
        borderRadius: 32,
        backgroundColor: KRAFT.pill,
        fontFamily: FONT.body,
        fontWeight: 500,
        fontSize: 34,
        color: KRAFT.tapeText,
      })}
    >
      {pageLabel(index, total).replace(/^0/, "").replace("/0", "/")}
    </div>
  );
}

function Headline({ slide, s }: { slide: Slide; s: KraftSizes }): ReactElement {
  const lines = splitHeadline(slide.headline, slide.accent);
  return (
    <div style={flex({ flexDirection: "column" })}>
      {lines.map((words, li) => (
        <div key={li} style={flex({ flexWrap: "wrap", alignItems: "center" })}>
          {words.map((w, i) => (
            <span
              key={i}
              style={flex({
                fontFamily: w.accent ? FONT.accent : FONT.head,
                fontStyle: w.accent ? "italic" : "normal",
                fontWeight: w.accent ? 700 : 400,
                fontSize: w.accent ? s.accent : s.headline,
                lineHeight: `${s.headLine}px`,
                height: s.headLine,
                letterSpacing: w.accent ? -s.accent * 0.01 : -s.headline * 0.004,
                color: w.accent ? KRAFT.red : KRAFT.ink,
                marginRight: w.joined ? 0 : s.wordGap,
              })}
            >
              {w.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The hand-written note and a curved arrow pointing down at what it is about. */
function Note({ text, s }: { text: string; s: KraftSizes }): ReactElement {
  const aw = Math.round(s.noteH * 1.05);
  return (
    <div style={flex({ justifyContent: "flex-end", alignItems: "center", height: s.noteH, marginTop: 6 })}>
      <div style={flex({ fontFamily: FONT.hand, fontSize: s.noteSize, color: KRAFT.red, transform: "rotate(-3deg)", marginRight: 10 })}>{text}</div>
      <svg width={aw} height={s.noteH} viewBox={`0 0 ${aw} ${s.noteH}`}>
        <path d={arrowPath(aw, s.noteH)} fill="none" stroke={KRAFT.red} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** "SWIPE" in marker with a small arrow, bottom right. */
function Swipe({ s }: { s: KraftSizes }): ReactElement {
  return (
    <div style={flex({ justifyContent: "flex-end", alignItems: "center", height: s.swipe, marginTop: 20 })}>
      <div style={flex({ fontFamily: FONT.hand, fontSize: 44, letterSpacing: 2, color: KRAFT.red, transform: "rotate(-2deg)" })}>SWIPE</div>
      <svg width={64} height={30} viewBox="0 0 64 30" style={{ marginLeft: 10 }}>
        <path d="M4 15 L56 15 M44 4 L58 15 L44 26" fill="none" stroke={KRAFT.red} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** The key figure of a card, large, with a hand-drawn red circle round it. */
function Figure({ text, s }: { text: string; s: KraftSizes }): ReactElement {
  const w = Math.round(textWidth("anton", text, s.big, 0)) + 2 * Math.round(s.big * 0.38);
  const h = figureHeight(s);
  return (
    <div style={flex({ position: "relative", alignSelf: "flex-start", width: w, height: h, alignItems: "center", justifyContent: "center", marginBottom: s.bigMb })}>
      <div style={flex({ fontFamily: FONT.head, fontSize: s.big, lineHeight: `${h}px`, color: KRAFT.ink })}>{text}</div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", left: 0, top: 0 }}>
        <path d={scribbleCirclePath(w, h, seedFrom(text))} fill="none" stroke={KRAFT.red} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function PaperCard({ card, s, tilt, first, side }: { card: SlideCard; s: KraftSizes; tilt: number; first: boolean; side: "left" | "right" }): ReactElement {
  return (
    <div style={flex({ position: "relative", width: "100%", transform: `rotate(${tilt}deg)` })}>
      <div
        style={flex({
          flexDirection: "column",
          width: "100%",
          padding: `${s.cardPadTop}px ${s.cardPadX}px ${s.cardPadBottom}px`,
          backgroundColor: KRAFT.card,
          borderRadius: 8,
          boxShadow: KRAFT.cardShadow,
        })}
      >
        {card.label && (
          <div style={flex({ fontFamily: FONT.mono, fontWeight: 500, fontSize: 24, letterSpacing: 3, textTransform: "uppercase", color: KRAFT.muted, marginBottom: 10 })}>{card.label}</div>
        )}
        {card.big && <Figure text={card.big} s={s} />}
        <div style={flex({ fontFamily: FONT.body, fontWeight: 400, fontSize: s.cardText, lineHeight: 1.32, color: KRAFT.ink })}>{card.text}</div>
      </div>
      {(first || side === "left") && <Tape left={-40} top={-24} rotate={-36} />}
      {(first || side === "right") && <Tape left={SLIDE_WIDTH - 2 * KRAFT_PAD_X - 78} top={-24} rotate={36} />}
    </div>
  );
}

/** A dark card is a terminal window in a paper frame: three dots, a title and the text in mono. */
function Terminal({ card, s, tilt, first }: { card: SlideCard; s: KraftSizes; tilt: number; first: boolean }): ReactElement {
  const lines = card.text.split("\n");
  return (
    <div style={flex({ position: "relative", width: "100%", transform: `rotate(${tilt}deg)` })}>
      <div style={flex({ flexDirection: "column", width: "100%", padding: s.termFrame, backgroundColor: KRAFT.card, borderRadius: 10, boxShadow: KRAFT.cardShadow })}>
        <div style={flex({ flexDirection: "column", width: "100%", backgroundColor: KRAFT.terminal, borderRadius: 12 })}>
          <div style={flex({ position: "relative", alignItems: "center", height: s.termBar, padding: "0 26px" })}>
            <div style={flex({ width: 20, height: 20, borderRadius: 10, backgroundColor: KRAFT.dotRed, marginRight: 12 })} />
            <div style={flex({ width: 20, height: 20, borderRadius: 10, backgroundColor: KRAFT.dotYellow, marginRight: 12 })} />
            <div style={flex({ width: 20, height: 20, borderRadius: 10, backgroundColor: KRAFT.dotGreen })} />
            <div style={flex({ position: "absolute", left: 0, top: 0, width: "100%", height: s.termBar, alignItems: "center", justifyContent: "center", fontFamily: FONT.body, fontSize: 26, color: KRAFT.terminalMuted })}>
              {(card.label ?? "bash").toLowerCase()}
            </div>
          </div>
          <div style={flex({ flexDirection: "column", padding: `${Math.round(s.termPad * 0.4)}px ${s.termPad}px ${s.termPad}px` })}>
            {lines.map((line, i) => (
              <div key={i} style={flex({ fontFamily: FONT.mono, fontWeight: 500, fontSize: s.termText, lineHeight: 1.45, color: KRAFT.terminalText })}>
                {line.startsWith("$") && <span style={flex({ color: KRAFT.terminalPrompt, marginRight: 14 })}>$</span>}
                <span style={flex({ flexWrap: "wrap" })}>{line.startsWith("$") ? line.slice(1).trim() : line}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Tape left={SLIDE_WIDTH - 2 * KRAFT_PAD_X - 78} top={-24} rotate={36} />
      {first && <Tape left={-40} top={-24} rotate={-36} />}
    </div>
  );
}

const TILTS = [-1.3, 1, -0.8];

function Cards({ slide, s }: { slide: Slide; s: KraftSizes }): ReactElement | null {
  const cards = slide.cards ?? [];
  if (cards.length === 0) return null;
  return (
    <div style={flex({ flexDirection: "column", width: "100%" })}>
      {cards.map((card, i) => (
        <div key={i} style={flex({ width: "100%", marginTop: i === 0 ? 0 : s.cardGap })}>
          {isTerminal(card) ? <Terminal card={card} s={s} tilt={TILTS[i % 3]} first={i === 0} /> : <PaperCard card={card} s={s} tilt={TILTS[i % 3]} first={i === 0} side={i % 2 === 0 ? "left" : "right"} />}
        </div>
      ))}
    </div>
  );
}

function List({ slide, s }: { slide: Slide; s: KraftSizes }): ReactElement | null {
  const items = slide.items ?? [];
  if (items.length === 0) return null;
  return (
    <div style={flex({ position: "relative", width: "100%", transform: "rotate(-0.8deg)" })}>
      <div style={flex({ flexDirection: "column", width: "100%", padding: `${s.cardPadTop}px ${s.cardPadX}px ${s.cardPadBottom}px`, backgroundColor: KRAFT.card, borderRadius: 8, boxShadow: KRAFT.cardShadow })}>
        {items.map((item, i) => (
          <div key={i} style={flex({ alignItems: "flex-start", marginTop: i === 0 ? 0 : s.listGap })}>
            <div style={flex({ fontFamily: FONT.head, fontSize: s.listNum, lineHeight: 1, color: KRAFT.red, width: s.listNum + 28 })}>{i + 1}</div>
            <div style={flex({ flexDirection: "column", flex: 1 })}>
              {item.label && <div style={flex({ fontFamily: FONT.mono, fontWeight: 500, fontSize: 22, letterSpacing: 3, textTransform: "uppercase", color: KRAFT.muted, marginBottom: 6 })}>{item.label}</div>}
              <div style={flex({ fontFamily: FONT.body, fontWeight: 500, fontSize: s.listText, lineHeight: 1.3, color: KRAFT.ink })}>{item.text}</div>
            </div>
          </div>
        ))}
      </div>
      <Tape left={-40} top={-24} rotate={-36} />
      <Tape left={SLIDE_WIDTH - 2 * KRAFT_PAD_X - 78} top={-24} rotate={36} />
    </div>
  );
}

function Pills({ slide, s }: { slide: Slide; s: KraftSizes }): ReactElement {
  const pills = slide.pills?.length ? slide.pills : ["Follow", "Save", "Share"];
  return (
    <div style={flex({ alignItems: "center", height: s.labelH + 12 })}>
      {pills.map((p, i) => (
        <div key={i} style={flex({ marginRight: 22 })}>
          <TornLabel text={p} size={Math.round(s.label * 0.78)} height={Math.round(s.labelH * 0.86)} rotate={i % 2 === 0 ? -2.5 : 2} />
        </div>
      ))}
    </div>
  );
}

/** The cover and the single-statement slide: a big headline, a spaced-caps line, and the italic line on a pasted note. */
function CoverBody({ slide, s }: { slide: Slide; s: KraftSizes }): ReactElement {
  return (
    <div style={flex({ flexDirection: "column", flex: 1 })}>
      <div style={flex({ flexDirection: "column", marginTop: s.gap })}>
        <Headline slide={slide} s={s} />
      </div>
      {slide.kicker && (
        <div style={flex({ marginTop: s.gap, fontFamily: FONT.body, fontWeight: 500, fontSize: s.coverKicker, letterSpacing: 5, textTransform: "uppercase", color: KRAFT.ink })}>{slide.kicker}</div>
      )}
      {slide.note && <Note text={slide.note} s={s} />}
      <div style={flex({ flex: 1 })} />
      {slide.sub && (
        <div style={flex({ position: "relative", width: "100%", transform: "rotate(1.6deg)", marginTop: s.gap })}>
          <div style={flex({ width: "100%", padding: `${s.cardPadTop}px ${s.cardPadX}px`, backgroundColor: KRAFT.card, borderRadius: 8, boxShadow: KRAFT.cardShadow, fontFamily: FONT.body, fontStyle: "italic", fontSize: s.coverSub, lineHeight: 1.3, color: KRAFT.ink })}>
            {slide.sub}
          </div>
          <Tape left={-40} top={-24} rotate={-36} />
          <Tape left={SLIDE_WIDTH - 2 * KRAFT_PAD_X - 78} top={-24} rotate={36} />
        </div>
      )}
    </div>
  );
}

export default function KraftSlide({ slide, index, total }: { slide: Slide; index: number; total: number }): ReactElement {
  const last = index >= total - 1;
  const s = fitKraft(slide, last).sizes;
  const single = slide.layout === "statement";
  const front = slide.layout === "cover" || single;
  const showSwipe = !last && slide.layout !== "close" && total > 1;
  return (
    <div
      style={flex({
        flexDirection: "column",
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        padding: `${KRAFT_PAD_TOP}px ${KRAFT_PAD_X}px ${KRAFT_PAD_BOTTOM}px`,
        backgroundColor: KRAFT.paper,
        backgroundImage: `radial-gradient(circle at 50% 40%, rgba(255, 244, 220, 0.16) 0%, rgba(255, 244, 220, 0) 45%, rgba(90, 58, 20, 0.15) 100%), url(${kraftTextureUri()})`,
        backgroundSize: `100% 100%, ${KRAFT_TILE_SIZE}px ${KRAFT_TILE_SIZE}px`,
        backgroundRepeat: "no-repeat, repeat",
      })}
    >
      <div style={flex({ justifyContent: "space-between", alignItems: "flex-start", height: front ? 64 : s.labelH })}>
        <div style={flex({ paddingTop: 4 })}>{!front && slide.kicker ? <TornLabel text={slide.kicker} size={s.label} height={s.labelH} /> : null}</div>
        {total > 1 ? <CounterPill index={index} total={total} /> : null}
      </div>

      {front ? (
        <CoverBody slide={slide} s={s} />
      ) : (
        <div style={flex({ flexDirection: "column", flex: 1 })}>
          <div style={flex({ flexDirection: "column", marginTop: s.gap })}>
            <Headline slide={slide} s={s} />
          </div>
          {slide.note && <Note text={slide.note} s={s} />}
          {slide.layout === "list" && (
            <div style={flex({ marginTop: s.gap + 24 })}>
              <List slide={slide} s={s} />
            </div>
          )}
          {slide.layout === "cards" && (
            <div style={flex({ marginTop: s.gap + 24 })}>
              <Cards slide={slide} s={s} />
            </div>
          )}
          {slide.sub && (
            <div style={flex({ marginTop: s.subMt, fontFamily: FONT.body, fontStyle: "italic", fontSize: s.sub, lineHeight: 1.26, color: KRAFT.ink })}>{slide.sub}</div>
          )}
          <div style={flex({ flex: 1 })} />
          {slide.layout === "close" && <Pills slide={slide} s={s} />}
        </div>
      )}

      {single && slide.tag && (
        <div style={flex({ justifyContent: "flex-end", marginTop: 20, fontFamily: FONT.hand, fontSize: 36, color: KRAFT.red })}>{slide.tag}</div>
      )}
      {showSwipe && <Swipe s={s} />}
    </div>
  );
}
