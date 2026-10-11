import type { CSSProperties, ReactElement, ReactNode } from "react";
import { SLIDE_HEIGHT, SLIDE_WIDTH, splitHeadline, type Slide } from "../../../convex/lib/carouselSlides";
import { GUIDE } from "@/lib/guidePalette";
import {
  FOOT_H,
  GUIDE_INNER_W,
  GUIDE_PAD_BOTTOM,
  GUIDE_PAD_TOP,
  GUIDE_PAD_X,
  HEAD_LINE,
  PILL_H,
  fitGuide,
  guideBoxes,
  underlineSpan,
  type GuideBox,
  type GuideSizes,
} from "@/lib/carouselGuideFit";
import { arrowPath, seedFrom, underlinePath } from "@/lib/kraftShapes";

/**
 * One slide in the Orange guide theme, drawn by satori (flexbox only, inline styles, every element with several
 * children is `display: flex`): a warm cream page, a heavy condensed capital headline in near-black with one orange
 * phrase and a hand-drawn orange underline, a hand-written margin note with an arrow, boxes with a thin orange outline
 * for the takeaway (three short monospace lines) and a pixel-style window for a command, a round counter top right and
 * the author's handle with "save for later" along the bottom. Read off the founder's "Claude Code just got mods"
 * reference; it cannot draw that reference's pixel characters or icons.
 */
const FONT = { head: "Anton", hand: "Marker", mono: "DMMono", body: "DMSans" } as const;

const flex = (extra: CSSProperties = {}): CSSProperties => ({ display: "flex", ...extra });

function Sparkles(): ReactElement {
  const spokes = [0, 45, 90, 135];
  return (
    <div style={flex({ position: "absolute", left: 0, top: 44, width: SLIDE_WIDTH, justifyContent: "center" })}>
      <svg width={120} height={120} viewBox="-60 -60 120 120">
        {spokes.map((deg) => (
          <line key={deg} x1={0} y1={-46} x2={0} y2={46} stroke={GUIDE.orange} strokeWidth={15} strokeLinecap="round" transform={`rotate(${deg})`} />
        ))}
        <path d="M-92 -24 h14 M-85 -31 v14 M96 -34 h14 M103 -41 v14 M-72 40 h12 M-66 34 v12" stroke="#cfc6b8" strokeWidth={3} fill="none" />
      </svg>
    </div>
  );
}

function Counter({ index, total }: { index: number; total: number }): ReactElement {
  return (
    <div
      style={flex({
        position: "absolute",
        top: GUIDE_PAD_TOP,
        right: GUIDE_PAD_X,
        alignItems: "center",
        height: PILL_H,
        padding: "0 30px",
        borderRadius: PILL_H / 2,
        backgroundColor: GUIDE.pill,
        color: GUIDE.pillText,
        fontFamily: FONT.body,
        fontWeight: 500,
        fontSize: 34,
      })}
    >
      {`${index + 1}/${total}`}
    </div>
  );
}

function Headline({ slide, size }: { slide: Slide; size: number }): ReactElement {
  const lines = splitHeadline(slide.headline.toUpperCase(), slide.accent?.toUpperCase());
  const span = underlineSpan(slide, size);
  const seed = seedFrom(slide.headline);
  return (
    <div style={flex({ flexDirection: "column", alignItems: "center", position: "relative", width: GUIDE_INNER_W })}>
      {lines.map((words, li) => (
        <div key={li} style={flex({ flexWrap: "wrap", justifyContent: "center", fontFamily: FONT.head, fontSize: size, lineHeight: HEAD_LINE, textTransform: "uppercase" })}>
          {words.map((w, i) => (
            <span key={i} style={flex({ color: w.accent ? GUIDE.orange : GUIDE.ink, marginRight: w.joined ? 0 : size * 0.2 })}>
              {w.text}
            </span>
          ))}
        </div>
      ))}
      {span && (
        <div style={flex({ position: "absolute", left: Math.max(0, (GUIDE_INNER_W - span.lineWidth) / 2 + (span.lineWidth - span.accentWidth)), bottom: -26, width: span.accentWidth, height: 26 })}>
          <svg width={Math.round(span.accentWidth)} height={26} viewBox={`0 0 ${Math.round(span.accentWidth)} 26`}>
            <path d={underlinePath(Math.round(span.accentWidth) - 4, seed)} stroke={GUIDE.orange} strokeWidth={7} fill="none" strokeLinecap="round" />
            <path d={underlinePath(Math.round(span.accentWidth * 0.78), seed + 7)} transform="translate(18 12)" stroke={GUIDE.orange} strokeWidth={6} fill="none" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  );
}

/** The hand-written margin note with a curved arrow beside it. */
function Note({ text, size }: { text: string; size: number }): ReactElement {
  const aw = 150;
  const ah = 110;
  return (
    <div style={flex({ alignItems: "flex-start", gap: 12, width: "100%" })}>
      <div style={flex({ fontFamily: FONT.hand, fontSize: size, lineHeight: 1.15, color: GUIDE.ink, transform: "rotate(-3deg)", maxWidth: 620 })}>{text}</div>
      <svg width={aw} height={ah} viewBox={`0 0 ${aw} ${ah}`}>
        <path d={arrowPath(aw, ah)} fill="none" stroke={GUIDE.ink} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Dots(): ReactElement {
  return (
    <div style={flex({ gap: 12 })}>
      {[GUIDE.dotRed, GUIDE.dotYellow, GUIDE.dotGreen].map((c) => (
        <div key={c} style={flex({ width: 22, height: 22, borderRadius: 11, backgroundColor: c })} />
      ))}
    </div>
  );
}

function Box({ box, s }: { box: GuideBox; s: GuideSizes }): ReactElement {
  const mono: CSSProperties = { fontFamily: FONT.mono, fontWeight: 500, fontSize: s.box, lineHeight: 1.45, color: GUIDE.ink };
  if (box.kind === "terminal") {
    return (
      <div style={flex({ flexDirection: "column", width: "100%", backgroundColor: GUIDE.white, border: `6px solid ${GUIDE.ink}`, borderRadius: 16, padding: `22px ${s.boxPad}px ${s.boxPad}px` })}>
        <Dots />
        <div style={flex({ flexDirection: "column", marginTop: 22 })}>
          {box.lines.map((l, i) => (
            <div key={i} style={flex({ gap: 18, ...mono })}>
              <span style={flex({ color: "#9a8f86" })}>{i === 0 ? ">" : " "}</span>
              <span style={flex({ flex: 1 })}>{l}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div style={flex({ flexDirection: "column", width: "100%", backgroundColor: GUIDE.white, border: `6px solid ${GUIDE.orange}`, borderRadius: 40, padding: `${s.boxPad}px ${s.boxPad + 6}px` })}>
      {box.lines.map((l, i) => (
        <div key={i} style={flex(mono)}>
          {l}
        </div>
      ))}
    </div>
  );
}

/** The close slide's dark list panel: a title bar and cream bars (the pills' words), where the reference has a pixel list. */
function Panel({ title, rows }: { title: string; rows: string[] }): ReactElement {
  return (
    <div style={flex({ flexDirection: "column", width: "100%", backgroundColor: GUIDE.panel, borderRadius: 28, padding: "30px 34px 34px", gap: 22 })}>
      <div style={flex({ fontFamily: FONT.mono, fontWeight: 500, fontSize: 42, letterSpacing: 3, color: GUIDE.white, textTransform: "uppercase" })}>{title}</div>
      {rows.map((r, i) => (
        <div key={i} style={flex({ alignItems: "center", gap: 24 })}>
          <div style={flex({ width: 54, height: 54, borderRadius: 14, backgroundColor: GUIDE.orange })} />
          <div style={flex({ flex: 1, alignItems: "center", height: 80, padding: "0 30px", borderRadius: 14, backgroundColor: GUIDE.bar, fontFamily: FONT.mono, fontWeight: 500, fontSize: 36, color: GUIDE.ink })}>{r}</div>
        </div>
      ))}
    </div>
  );
}

function Footer({ slide }: { slide: Slide }): ReactElement {
  return (
    <div style={flex({ justifyContent: "space-between", alignItems: "center", height: FOOT_H, width: "100%" })}>
      <div style={flex({ fontFamily: FONT.hand, fontSize: 40, color: GUIDE.ink })}>{slide.tag ?? ""}</div>
      <div style={flex({ fontFamily: FONT.hand, fontSize: 40, color: GUIDE.ink })}>save for later</div>
    </div>
  );
}

function Frame({ children }: { children: ReactNode }): ReactElement {
  return (
    <div
      style={flex({
        flexDirection: "column",
        position: "relative",
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        padding: `${GUIDE_PAD_TOP}px ${GUIDE_PAD_X}px ${GUIDE_PAD_BOTTOM}px`,
        background: `linear-gradient(180deg, ${GUIDE.bg} 0%, #f4ede2 62%, ${GUIDE.bgDeep} 100%)`,
      })}
    >
      {children}
    </div>
  );
}

export default function GuideSlide({ slide, index, total }: { slide: Slide; index: number; total: number }): ReactElement {
  const s = fitGuide(slide).sizes;
  const size = s.headline;
  const boxes = guideBoxes(slide);
  const decorated = slide.layout === "cover" || slide.layout === "close";
  return (
    <Frame>
      {decorated && <Sparkles />}
      <Counter index={index} total={total} />
      <div style={flex({ flexDirection: "column", alignItems: "center", justifyContent: slide.layout === "statement" ? "center" : "flex-start", marginTop: decorated ? 118 : 84, ...(slide.layout === "statement" ? { flex: 1 } : {}) })}>
        <Headline slide={slide} size={size} />
      </div>
      {slide.layout !== "statement" && <div style={flex({ flex: 1, minHeight: 36 })} />}
      {slide.note && (
        <div style={flex({ marginTop: 48, marginBottom: s.gap })}>
          <Note text={slide.note} size={s.note} />
        </div>
      )}
      {boxes.length > 0 && (
        <div style={flex({ flexDirection: "column", gap: s.gap, width: "100%" })}>
          {boxes.map((b, i) => (
            <Box key={i} box={b} s={s} />
          ))}
        </div>
      )}
      {slide.layout === "close" && <Panel title={slide.sub ?? ""} rows={slide.pills?.length ? slide.pills : ["", "", ""]} />}
      <div style={flex({ flex: 0.5, minHeight: 24 })} />
      <Footer slide={slide} />
    </Frame>
  );
}
