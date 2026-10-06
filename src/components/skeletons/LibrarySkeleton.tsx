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
/** The four postcards of the phone board (M08e). */
const PHONE_POSTCARDS = [
  { tilt: -0.6, dim: false },
  { tilt: 0.8, dim: true },
  { tilt: -0.8, dim: true },
  { tilt: 0.6, dim: false },
];
const FRAME_TILTS = [-1, 0.8, -0.6, 1, -0.8];
const STRIP_TILTS = [-1, 0.8, -0.6];

export type LibrarySkeletonTab = "published" | "drafts" | "frames" | "media";

/** The real tab labels (counts are data, so they are left out). */
const TABS: { tab: LibrarySkeletonTab; long: string; short: string }[] = [
  { tab: "published", long: "Published", short: "Published" },
  { tab: "drafts", long: "Drafts", short: "Drafts" },
  { tab: "frames", long: "Story frames", short: "Frames" },
  { tab: "media", long: "Media", short: "Media" },
];

/** The library's tab strip, drawn with the real tab classes but not clickable. */
function StaticTabs({ active }: { active: LibrarySkeletonTab }) {
  return (
    <div className="lb-tabs sq-skel-static" aria-hidden="true">
      {TABS.map((t) => (
        <span key={t.tab} className="lb-tab" aria-current={t.tab === active ? "page" : undefined}>
          <span className="lb-tab-long">{t.long}</span>
          <span className="lb-tab-short">{t.short}</span>
        </span>
      ))}
    </div>
  );
}

function Postcard({ tilt, dim, compact }: { tilt: number; dim: boolean; compact?: boolean }) {
  return (
    <div
      className={`sq-skel-postcard${dim ? " sq-skel-postcard-dim" : ""}${compact ? " sq-skel-postcard-m" : ""}`}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <Skeleton w={compact ? "50%" : "55%"} h={compact ? 9 : 10} />
      <Skeleton w="96%" h={compact ? 12 : 13} />
      <Skeleton w={compact ? "88%" : "90%"} h={compact ? 12 : 13} />
      <Skeleton w="60%" h={compact ? 12 : 13} />
      <div className="sq-skel-row sq-skel-push" style={{ gap: compact ? 5 : 6 }}>
        <Skeleton w="50%" h={32} r={16} />
        <Skeleton w="50%" h={32} r={16} />
      </div>
    </div>
  );
}

/**
 * Board 08e: the real tab strip and filters stay on screen, a grid of tilted
 * postcards sits beside the dark story-frames rail. On a phone (board M08e): the
 * tabs, a swipeable frames strip and four postcards, no rail.
 */
export default function LibrarySkeleton({ tab = "published" }: { tab?: LibrarySkeletonTab }) {
  return (
    <LoadingRegion label="Loading the library…">
      <div className="sq-skel-desk">
        <div className="sq-skel-topbar" aria-hidden="true">
          <StaticTabs active={tab} />
          <div className="sq-skel-row sq-skel-toolbar-right">
            <span className="sq-skel-field sq-skel-static">Search everything you&apos;ve written</span>
            <span className="sq-btn sq-skel-static">Pillar · All</span>
            <span className="sq-btn sq-skel-static">Platform · Both</span>
          </div>
        </div>
        <SkeletonHeader statementWidth={560} lineHeight={58} statementLines={[100, 64]} explainerLines={[100, 76]} />
        <div className="sq-skel-library-grid">
          <div className="sq-skel-postcards">
            {POSTCARDS.map((card, i) => (
              <Postcard key={i} {...card} />
            ))}
          </div>
          <aside className="sq-skel-card sq-skel-card-dark sq-skel-rail">
            <Skeleton w="50%" h={12} tone="dark" />
            {FRAME_TILTS.map((tilt) => (
              <Skeleton key={tilt} h={56} r={14} rot={tilt} tone="dark" />
            ))}
            <div className="sq-skel-col sq-skel-push" style={{ gap: 8 }}>
              <Skeleton w="30%" h={10} tone="dark" />
              <Skeleton w="90%" h={18} tone="dark" />
              <Skeleton w="70%" h={18} tone="dark" />
            </div>
            <Skeleton h={40} r={20} tone="dark" />
          </aside>
        </div>
      </div>

      <div className="sq-skel-phone">
        <StaticTabs active={tab} />
        <div className="sq-skel-col" style={{ gap: 8 }} aria-hidden="true">
          <Skeleton w="30%" h={10} />
          <div className="sq-skel-strip">
            {STRIP_TILTS.map((tilt) => (
              <span key={tilt} className="sq-skel-noshrink">
                <Skeleton w={150} h={58} r={14} rot={tilt} />
              </span>
            ))}
          </div>
        </div>
        <div className="sq-skel-postcards-m" aria-hidden="true">
          {PHONE_POSTCARDS.map((card, i) => (
            <Postcard key={i} {...card} compact />
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
