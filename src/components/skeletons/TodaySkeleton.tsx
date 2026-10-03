import Link from "next/link";
import SkeletonHeader from "@/components/skeletons/SkeletonHeader";
import Skeleton, { LoadingRegion } from "@/components/ui/Skeleton";
import { PlusIcon } from "@/components/ui/icons";

const RUNWAY_CELLS = Array.from({ length: 21 }, (_, i) => i);

function RunwayRow() {
  return (
    <div className="sq-skel-runway">
      <Skeleton w={60} h={12} tone="dark" />
      {RUNWAY_CELLS.map((i) => (
        <Skeleton key={i} h={34} r={7} tone="dark" />
      ))}
    </div>
  );
}

/** Board 08a: Today as blank shapes in its real 3×2 card layout. */
export default function TodaySkeleton() {
  return (
    <LoadingRegion label="Loading Today…">
      <div className="sq-skel-topbar">
        <Skeleton w={220} h={26} />
        <Link href="/studio" className="sq-btn sq-btn-primary">
          <PlusIcon />
          New from topic
        </Link>
      </div>
      <SkeletonHeader
        statementLines={[100, 72]}
        lineHeight={66}
        explainerWidth={300}
        explainerLines={[100, 90, 60]}
      />
      <div className="sq-skel-today-grid">
        <section className="sq-skel-card sq-skel-card-dim">
          <Skeleton w="40%" h={12} />
          <div className="sq-skel-note" style={{ transform: "rotate(-1.4deg)" }}>
            <Skeleton w="50%" h={12} />
            <Skeleton h={14} />
            <Skeleton w="94%" h={14} />
            <Skeleton w="70%" h={14} />
          </div>
          <div className="sq-skel-row" style={{ gap: 8 }}>
            <Skeleton w="50%" h={40} r={20} />
            <Skeleton w="50%" h={40} r={20} />
          </div>
        </section>

        <section className="sq-skel-card sq-skel-card-dark sq-skel-span-2">
          <Skeleton w="22%" h={12} tone="dark" />
          <div className="sq-skel-row" style={{ gap: 48 }}>
            <Skeleton w={180} h={54} tone="dark" />
            <Skeleton w={180} h={54} tone="dark" />
          </div>
          <RunwayRow />
          <RunwayRow />
        </section>

        <section className="sq-skel-card sq-skel-card-dim">
          <Skeleton w="45%" h={12} />
          {[0, 1, 2].map((i) => (
            <div key={i} className="sq-skel-col" style={{ gap: 6, padding: "8px 0" }}>
              <Skeleton w="90%" h={14} />
              <Skeleton w="50%" h={10} />
            </div>
          ))}
          <Skeleton h={40} r={20} />
        </section>

        <section className="sq-skel-card sq-skel-card-raised">
          <Skeleton w="35%" h={12} />
          <Skeleton h={54} r={14} />
          <Skeleton w="80%" h={12} />
          <Skeleton w="70%" h={12} />
          <Skeleton w="75%" h={12} />
          <Skeleton w="60%" h={12} />
        </section>

        <section className="sq-skel-card sq-skel-card-dim">
          <Skeleton w="50%" h={12} />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="sq-skel-row" style={{ gap: 10 }}>
              <Skeleton w="55%" h={12} />
              <Skeleton w="25%" h={12} />
            </div>
          ))}
          <Skeleton h={40} r={20} />
        </section>
      </div>
    </LoadingRegion>
  );
}
