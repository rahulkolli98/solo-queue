import Skeleton, { LoadingRegion } from "@/components/ui/Skeleton";

/** [Threads minis, IG tilt] per day column, as drawn on board 08c. */
const DAY_COLUMNS: { minis: number; tilt: number }[] = [
  { minis: 2, tilt: -1.5 },
  { minis: 1, tilt: 1 },
  { minis: 2, tilt: -0.8 },
  { minis: 1, tilt: 1.4 },
  { minis: 2, tilt: -1 },
  { minis: 1, tilt: 0.8 },
  { minis: 2, tilt: -1.4 },
];

/** Board 08c: seven day columns with blank Threads cards and Instagram tiles, plus the timeline. */
export default function QueueSkeleton() {
  return (
    <LoadingRegion label="Loading the queue…">
      <div className="sq-skel-topbar">
        <div className="sq-skel-row" style={{ gap: 8 }}>
          <Skeleton w={190} h={44} r={22} />
        </div>
        <div className="sq-skel-row" style={{ gap: 10 }}>
          <Skeleton w={200} h={44} r={22} />
          <Skeleton w={110} h={44} r={22} />
          <Skeleton w={150} h={44} r={22} />
        </div>
      </div>

      <div className="sq-skel-header">
        <div className="sq-skel-col" style={{ width: 520, gap: 12 }}>
          <Skeleton h={62} />
          <Skeleton w="70%" h={62} />
        </div>
        <div className="sq-skel-col" style={{ width: 340, gap: 8 }}>
          <Skeleton h={14} />
          <Skeleton w="80%" h={14} />
        </div>
      </div>

      <div className="sq-skel-queue">
        <div className="sq-skel-lanes" aria-hidden="true">
          <Skeleton h={48} />
          <div className="sq-skel-col" style={{ height: 230, gap: 8 }}>
            <Skeleton w={26} h={26} r={13} />
            <Skeleton w={70} h={14} />
          </div>
          <div className="sq-skel-col" style={{ gap: 8 }}>
            <Skeleton w={26} h={26} />
            <Skeleton w={80} h={14} />
          </div>
        </div>
        <div className="sq-skel-days">
          {DAY_COLUMNS.map(({ minis, tilt }, i) => (
            <div key={i} className="sq-skel-col" style={{ gap: 10 }}>
              <Skeleton h={48} r={16} />
              <div className="sq-skel-col" style={{ height: 230, gap: 8 }}>
                {Array.from({ length: minis }, (_, m) => (
                  <Skeleton key={m} h={104} r={12} />
                ))}
              </div>
              <Skeleton h={236} r={6} rot={tilt} />
            </div>
          ))}
        </div>
      </div>

      <div className="sq-skel-col" style={{ gap: 10 }}>
        <Skeleton h={26} r={13} />
        <div className="sq-skel-row" style={{ justifyContent: "space-between" }}>
          <Skeleton w={420} h={12} />
          <Skeleton w={260} h={12} />
        </div>
      </div>
    </LoadingRegion>
  );
}
