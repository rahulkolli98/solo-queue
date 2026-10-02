import SkeletonHeader from "@/components/skeletons/SkeletonHeader";
import Skeleton, { LoadingRegion } from "@/components/ui/Skeleton";

/** Tilt (deg) and tone of each postcard, as drawn on board 08e. */
const POSTCARDS = [
  { tilt: -0.6, dim: false },
  { tilt: 0.8, dim: true },
  { tilt: 0.5, dim: false },
  { tilt: -1, dim: true },
  { tilt: 1, dim: false },
  { tilt: -0.8, dim: true },
  { tilt: -0.5, dim: false },
  { tilt: 0.7, dim: true },
];
const FRAME_TILTS = [-1, 0.8, -0.6, 1, -0.8];

/** Board 08e: a grid of tilted postcards beside the dark story-frames rail. */
export default function LibrarySkeleton() {
  return (
    <LoadingRegion label="Loading the library…">
      <div className="sq-skel-topbar">
        <div className="sq-skel-row" style={{ gap: 8 }}>
          {[96, 84, 108, 72].map((w) => (
            <Skeleton key={w} w={w} h={38} r={19} />
          ))}
        </div>
        <div className="sq-skel-row" style={{ gap: 10 }}>
          <Skeleton w={230} h={44} r={22} />
        </div>
      </div>
      <SkeletonHeader statementWidth={560} lineHeight={58} statementLines={[100, 64]} explainerLines={[100, 76]} />
      <div className="sq-skel-library-grid">
        <div className="sq-skel-postcards">
          {POSTCARDS.map(({ tilt, dim }, i) => (
            <div
              key={i}
              className={`sq-skel-postcard${dim ? " sq-skel-postcard-dim" : ""}`}
              style={{ transform: `rotate(${tilt}deg)` }}
            >
              <Skeleton w="55%" h={10} />
              <Skeleton w="96%" h={13} />
              <Skeleton w="90%" h={13} />
              <Skeleton w="60%" h={13} />
              <div className="sq-skel-row" style={{ gap: 6 }}>
                <Skeleton w="50%" h={32} r={16} />
                <Skeleton w="50%" h={32} r={16} />
              </div>
            </div>
          ))}
        </div>
        <aside className="sq-skel-card sq-skel-card-dark sq-skel-rail">
          <Skeleton w="50%" h={12} tone="dark" />
          {FRAME_TILTS.map((tilt) => (
            <Skeleton key={tilt} h={56} r={14} rot={tilt} tone="dark" />
          ))}
          <div className="sq-skel-col" style={{ gap: 8 }}>
            <Skeleton w="30%" h={10} tone="dark" />
            <Skeleton w="90%" h={18} tone="dark" />
            <Skeleton w="70%" h={18} tone="dark" />
          </div>
          <Skeleton h={40} r={20} tone="dark" />
        </aside>
      </div>
    </LoadingRegion>
  );
}
