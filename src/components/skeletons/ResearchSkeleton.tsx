import SkeletonHeader from "@/components/skeletons/SkeletonHeader";
import Skeleton, { LoadingRegion } from "@/components/ui/Skeleton";

const CHIPS = [66, 52, 62, 70, 58];
const TOPIC_ROWS = [0, 1, 2, 3];

/** Board 08d: topic list on the left, the yellow collage board (brief, clippings, angles) on the right. */
export default function ResearchSkeleton() {
  return (
    <LoadingRegion label="Loading research…">
      <SkeletonHeader
        statementWidth={480}
        lineHeight={58}
        explainerWidth={360}
      />
      <div className="sq-skel-research-grid">
        <section className="sq-skel-col" style={{ gap: 10 }}>
          <div className="sq-skel-row" style={{ gap: 6, flexWrap: "wrap" }}>
            {CHIPS.map((w) => (
              <Skeleton key={w} w={w} h={34} r={17} />
            ))}
          </div>
          {TOPIC_ROWS.map((i) => (
            <div
              key={i}
              className={`sq-skel-topic${i === 0 ? " sq-skel-topic-dim" : ""}`}
            >
              <div className="sq-skel-row" style={{ gap: 10 }}>
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
    </LoadingRegion>
  );
}
