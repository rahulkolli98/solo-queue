import Skeleton, { LoadingRegion } from "@/components/ui/Skeleton";
import { PlusIcon } from "@/components/ui/icons";

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

/** Phone agenda rows (board M08c): [card height, radius, tilt]. */
const AGENDA_ROWS: { h: number; r: number; tilt: number }[] = [
  { h: 74, r: 16, tilt: 0 },
  { h: 128, r: 6, tilt: -0.8 },
  { h: 74, r: 16, tilt: 0 },
  { h: 60, r: 16, tilt: 0 },
];

const DAY_PILLS = [0, 1, 2, 3, 4, 5, 6];

/** One static segmented control, drawn with the real control's classes. */
function StaticSegs({ options }: { options: string[] }) {
  return (
    <div className="sq-segs sq-skel-static">
      {options.map((label, i) => (
        <span key={label} className={`sq-seg${i === 0 ? " sq-seg-on" : ""}`}>
          {label}
        </span>
      ))}
    </div>
  );
}

/**
 * Board 08c: the real toolbar stays on screen, the seven day columns with blank
 * Threads cards and Instagram tiles and the timeline are shapes. On a phone
 * (board M08c) there is no toolbar: a lead line, day pills and an agenda list.
 */
export default function QueueSkeleton() {
  return (
    <LoadingRegion label="Loading the queue…">
      <div className="sq-skel-desk">
        <div className="sq-skel-topbar" aria-hidden="true">
          <StaticSegs options={["Week", "3 weeks", "Month"]} />
          <div className="sq-skel-row sq-skel-toolbar-right">
            <StaticSegs options={["Both", "Threads", "Instagram"]} />
            <span className="sq-btn sq-skel-static">Slot rules</span>
            <span className="sq-btn sq-btn-primary sq-skel-static">
              <PlusIcon />
              New from topic
            </span>
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
            <span className="sq-skel-ghost">
              <Skeleton h={48} />
            </span>
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
                    <span key={m} className={m === 1 ? "sq-skel-fade" : undefined}>
                      <Skeleton h={104} r={12} />
                    </span>
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
      </div>

      <div className="sq-skel-phone" aria-hidden="true">
        <Skeleton w="80%" h={15} />
        <div className="sq-skel-daypills">
          {DAY_PILLS.map((i) => (
            <Skeleton key={i} h={64} r={16} />
          ))}
        </div>
        <Skeleton w="50%" h={11} />
        {AGENDA_ROWS.map(({ h, r, tilt }, i) => (
          <div key={i} className="sq-skel-agenda-row">
            <span className="sq-skel-stub">
              <Skeleton w={42} h={12} />
            </span>
            <span className="sq-skel-grow">
              <Skeleton h={h} r={r} rot={tilt} />
            </span>
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
