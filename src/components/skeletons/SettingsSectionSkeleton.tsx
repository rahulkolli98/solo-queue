import Skeleton, { LoadingRegion } from "@/components/ui/Skeleton";

/** One Settings section while it loads; the header and section list are already on screen. */
export default function SettingsSectionSkeleton() {
  return (
    <LoadingRegion label="Loading settings…">
      <div className="sq-skel-col" style={{ gap: 16 }}>
        <Skeleton w="40%" h={34} />
        <Skeleton w="60%" h={16} />
        <div className="sq-skel-card sq-skel-card-raised">
          <Skeleton w="35%" h={14} />
          <Skeleton h={44} r={12} />
          <Skeleton h={44} r={12} />
        </div>
      </div>
    </LoadingRegion>
  );
}
