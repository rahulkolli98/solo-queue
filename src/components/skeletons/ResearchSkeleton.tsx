import SkeletonHeader from "@/components/skeletons/SkeletonHeader";
import Skeleton, { LoadingRegion } from "@/components/ui/Skeleton";

const CHIPS = [66, 52, 62, 70, 58];
const PHONE_CHIPS = [66, 52, 62, 70];
const TOPIC_ROWS = [0, 1, 2, 3];

/** Board 08d: topic list on the left, the yellow collage board (brief, clippings, angles) on the right. */
function DesktopBody() {
  return (
    <>
      <SkeletonHeader statementWidth={480} lineHeight={58} explainerWidth={360} />
      <div className="sq-skel-research-grid">
        <section className="sq-skel-col" style={{ gap: 10 }}>
          <div className="sq-skel-row" style={{ gap: 6, flexWrap: "wrap" }}>
            {CHIPS.map((w) => (
              <Skeleton key={w} w={w} h={34} r={17} />
            ))}
          </div>
          {TOPIC_ROWS.map((i) => (
            <div key={i} className={`sq-skel-topic${i === 0 ? " sq-skel-topic-dim" : ""}`}>
              <div className="sq-skel-row" style={{ justifyContent: "space-between" }}>
                <Skeleton w={90} h={22} r={11} />
                <Skeleton w={60} h={10} />
              </div>
              <Skeleton w="92%" h={15} />
              <Skeleton w="48%" h={10} />
            </div>
          ))}
        </section>

        <section className="sq-skel-board">
          <div className="sq-skel-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div className="sq-skel-col" style={{ gap: 8, width: "60%" }}>
              <Skeleton w="40%" h={11} tone="yellow" />
              <Skeleton h={30} tone="yellow" />
            </div>
            <div className="sq-skel-row" style={{ gap: 8 }}>
              <Skeleton w={100} h={40} r={20} tone="yellow" />
              <Skeleton w={150} h={40} r={20} tone="yellow" />
            </div>
          </div>
          <div className="sq-skel-board-body">
            <div className="sq-skel-paper" style={{ transform: "rotate(-0.8deg)" }}>
              <Skeleton w="50%" h={10} />
              {[98, 94, 97, 90, 60].map((w, i) => (
                <Skeleton key={i} w={`${w}%`} h={15} />
              ))}
              <Skeleton w={1} h={8} />
              <Skeleton w="95%" h={15} />
              <Skeleton w="70%" h={15} />
            </div>
            <div className="sq-skel-col" style={{ gap: 14 }}>
              <Skeleton h={60} r={14} rot={1} tone="yellow" />
              <Skeleton w="88%" h={76} r={4} rot={-1.8} tone="yellow" />
              <Skeleton w="92%" h={96} r={4} rot={1.4} tone="yellow" />
              <Skeleton h={64} r={4} tone="yellow" />
            </div>
          </div>
          <div className="sq-skel-angles">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} h={78} r={18} tone="yellow" />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function PhoneTopicRow() {
  return (
    <div className="sq-skel-topic sq-skel-topic-m">
      <Skeleton w={70} h={20} r={10} />
      <Skeleton w="88%" h={14} />
      <Skeleton w="40%" h={10} />
    </div>
  );
}

/**
 * Board 08d. The crumb and the capture field are real and stay visible; the rest
 * is shapes. On a phone (board M08d): the capture form, four chips, the yellow
 * topic card, then two topic rows, with no big statement.
 */
export default function ResearchSkeleton() {
  return (
    <LoadingRegion label="Loading research…">
      <div className="sq-skel-desk">
        <div className="sq-skel-topbar" aria-hidden="true">
          <span className="t-eyebrow sq-skel-crumb">Research / Inbox</span>
          <div className="sq-skel-row sq-skel-static" style={{ gap: 8 }}>
            <span className="sq-skel-field sq-skel-field-wide">Paste a link, a quote, or a half-thought…</span>
            <span className="sq-btn sq-btn-dark">Save to inbox</span>
          </div>
        </div>
        <DesktopBody />
      </div>

      <div className="sq-skel-phone">
        <div className="sq-skel-capture sq-skel-static" aria-hidden="true">
          <span className="sq-skel-capture-text">Paste a link or a half-thought…</span>
          <span className="sq-btn sq-btn-dark">Save</span>
        </div>
        <div className="sq-skel-col" style={{ gap: 12 }} aria-hidden="true">
          <div className="sq-skel-row" style={{ gap: 6 }}>
            {PHONE_CHIPS.map((w) => (
              <span key={w} className="sq-skel-noshrink">
                <Skeleton w={w} h={36} r={18} />
              </span>
            ))}
          </div>
          <div className="sq-skel-board sq-skel-board-m">
            <div className="sq-skel-row" style={{ justifyContent: "space-between" }}>
              <Skeleton w={80} h={22} r={11} tone="yellow" />
              <Skeleton w={90} h={10} tone="yellow" />
            </div>
            <Skeleton w="90%" h={22} tone="yellow" />
            <div className="sq-skel-row" style={{ gap: 10, alignItems: "stretch" }}>
              <div className="sq-skel-paper sq-skel-paper-m" style={{ transform: "rotate(-1deg)" }}>
                <Skeleton w="30%" h={9} />
                <Skeleton w="96%" h={12} />
                <Skeleton w="86%" h={12} />
                <Skeleton w="60%" h={12} />
              </div>
              <div className="sq-skel-col sq-skel-clippings" style={{ gap: 8 }}>
                <Skeleton h={64} r={4} rot={2} tone="yellow" />
                <Skeleton h={48} r={10} tone="yellow" />
              </div>
            </div>
            <Skeleton h={48} r={24} tone="yellow" />
          </div>
          <PhoneTopicRow />
          <PhoneTopicRow />
        </div>
      </div>
    </LoadingRegion>
  );
}
