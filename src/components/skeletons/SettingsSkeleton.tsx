import SkeletonHeader from "@/components/skeletons/SkeletonHeader";
import Skeleton, { LoadingRegion } from "@/components/ui/Skeleton";

/** Settings: the section list on the left, one section's cards on the right. */
export default function SettingsSkeleton() {
  return (
    <LoadingRegion label="Loading settings…">
      <SkeletonHeader statementWidth={520} lineHeight={58} />
      <div className="sq-skel-research-grid" style={{ gridTemplateColumns: "240px minmax(0, 1fr)" }}>
        <section className="sq-skel-col" style={{ gap: 6 }}>
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} h={44} r={22} />
          ))}
        </section>
        <section className="sq-skel-col" style={{ gap: 16 }}>
          <div className="sq-skel-card sq-skel-card-dark">
            <Skeleton w="30%" h={14} tone="dark" />
            <Skeleton h={54} r={14} tone="dark" />
            <Skeleton w="70%" h={12} tone="dark" />
          </div>
          <div className="sq-skel-card sq-skel-card-raised">
            <Skeleton w="35%" h={14} />
            <Skeleton h={44} r={12} />
            <Skeleton h={44} r={12} />
          </div>
        </section>
      </div>
    </LoadingRegion>
  );
}
