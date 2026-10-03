import SkeletonHeader from "@/components/skeletons/SkeletonHeader";
import Skeleton, { LoadingRegion } from "@/components/ui/Skeleton";

/** Publishing log: three status cards and the receipts table as blank shapes. */
export default function LogSkeleton() {
  return (
    <LoadingRegion label="Loading the publishing log…">
      <SkeletonHeader statementWidth={560} lineHeight={58} statementLines={[100, 70]} explainerLines={[100, 70]} />
      <div className="sq-skel-today-grid" style={{ gridTemplateRows: "none", flexGrow: 0 }}>
        <div className="sq-skel-card sq-skel-card-dark">
          <Skeleton w="40%" h={12} tone="dark" />
          <Skeleton w="50%" h={40} tone="dark" />
          <Skeleton w="80%" h={12} tone="dark" />
        </div>
        <div className="sq-skel-card sq-skel-card-dim">
          <Skeleton w="45%" h={12} />
          <Skeleton h={8} />
          <Skeleton h={8} />
        </div>
        <div className="sq-skel-card sq-skel-card-dim">
          <Skeleton w="45%" h={12} />
          <Skeleton w="85%" h={14} />
          <Skeleton w="85%" h={14} />
        </div>
      </div>
      <div className="sq-skel-card sq-skel-card-raised">
        <Skeleton w="20%" h={12} />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} h={36} r={8} />
        ))}
      </div>
    </LoadingRegion>
  );
}
