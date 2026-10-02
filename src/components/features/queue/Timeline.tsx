import {
  shortDay,
  timelineLabels,
  TIMELINE_DAYS,
  type BoardDay,
  type FirstGap,
  type TimelineModel,
} from "@/lib/queueBoard";

/** 21-day coverage strip (board 03): the covered band, one dot per day, today ringed, the first gap in rust. */
export default function Timeline({
  days,
  model,
  gap,
}: {
  days: BoardDay[];
  model: TimelineModel;
  gap: FirstGap | null;
}) {
  const labels = timelineLabels(days, model);
  const bandWidth = (model.covered / TIMELINE_DAYS) * 100;
  const summary =
    model.firstGap === -1
      ? "Covered through the next 21 days."
      : gap
        ? `Covered for ${model.covered} day${model.covered === 1 ? "" : "s"}. First gap ${shortDay(gap.day.key)} at ${gap.time}.`
        : `Covered for ${model.covered} days.`;
  return (
    <div className="sq-q-timeline">
      <div className="sq-q-strip" role="img" aria-label={summary}>
        <div className="sq-q-rail" />
        {bandWidth > 0 && <div className="sq-q-band" style={{ width: `${bandWidth}%` }} />}
        <div className="sq-q-dots">
          {model.states.map((state, i) => {
            const mark = i === 0 ? "today" : i === model.firstGap ? "firstgap" : state;
            return (
              <span key={days[i].key} className="sq-q-dotcell">
                <span className={`sq-q-dot sq-q-dot-${mark}`} />
              </span>
            );
          })}
        </div>
      </div>
      <div className="sq-q-tlabels t-mono" aria-hidden="true">
        {labels.map((l) => (
          <span
            key={l.col}
            className={l.tone === "gap" ? "sq-q-tlabel-gap" : undefined}
            style={{ gridColumn: `${l.col} / span ${l.span}`, justifySelf: l.end ? "end" : undefined }}
          >
            {l.text}
          </span>
        ))}
      </div>
    </div>
  );
}
