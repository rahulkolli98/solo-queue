import Link from "next/link";
import { ArrowRightIcon } from "@/components/ui/icons";
import { PLATFORM_NAME, addDays, stripLabels } from "@/lib/queueBoard";
import {
  RUNWAY_DAYS,
  coverageOf,
  firstOpenCell,
  runwayAria,
  runwayDay,
  runwayNote,
  type Platform,
  type TodaySummary,
} from "@/lib/today";

type Runway = TodaySummary["runway"][Platform];

function Figure({ platform, runway, today, muted }: { platform: Platform; runway: Runway; today: string; muted: boolean }) {
  const cov = coverageOf(today, runway.daysAhead);
  return (
    <div className="sq-t-figure">
      <div className={`t-figure sq-t-figure-${platform}${muted ? " sq-t-figure-muted" : ""}`}>
        {cov.capped ? `${RUNWAY_DAYS}+` : cov.days} {cov.days === 1 ? "day" : "days"}
      </div>
      <div className="sq-t-figure-sub">
        of {PLATFORM_NAME[platform]} written
        {runway.posts > 0 ? ` · ${runway.posts} post${runway.posts === 1 ? "" : "s"}` : ""}
      </div>
    </div>
  );
}

function Strip({ platform, runway }: { platform: Platform; runway: Runway }) {
  const firstOpen = runway.cells.indexOf("open");
  return (
    <div className="sq-t-runrow" role="img" aria-label={runwayAria(PLATFORM_NAME[platform], runway.cells, runway.emptyDays)}>
      <span className="t-mono sq-t-runlabel">{PLATFORM_NAME[platform].toUpperCase()}</span>
      <div className="sq-t-cells">
        {runway.cells.map((state, i) => {
          const cls = [
            "sq-t-cell",
            state === "written" ? `sq-t-cell-written sq-t-cell-${platform}` : `sq-t-cell-${state}`,
            i === 0 ? "sq-t-cell-today" : "",
            i === firstOpen ? "sq-t-cell-gap" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <span key={i} className={cls}>
              {state === "failed" ? "!" : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The dark runway card (spans two columns): days written per platform, the
 * 21-day strips with today ringed, open days dashed, the first gap ringed in
 * coral and failed days marked "!". On first run the figures go quiet.
 */
export default function RunwayCard({ summary, firstRun = false }: { summary: TodaySummary; firstRun?: boolean }) {
  const { runway, today } = summary;
  const keys = Array.from({ length: RUNWAY_DAYS }, (_, i) => addDays(today, i));
  const labels = stripLabels(keys, firstOpenCell(summary), {
    today: runwayDay,
    day: runwayDay,
    gap: (k) => `▲ GAP ${runwayDay(k)}`,
  });
  const note = firstRun ? { text: "NOTHING WRITTEN YET", warn: false } : runwayNote(summary);
  return (
    <section className="sq-t-card sq-t-card-ink" aria-labelledby="sq-t-runway-h">
      <div className="sq-t-card-head">
        <h2 id="sq-t-runway-h" className="t-eyebrow">
          Queue runway
        </h2>
        <span className={`t-mono sq-t-note-right${note.warn ? " sq-t-warn" : ""}`}>{note.text}</span>
      </div>
      <div className="sq-t-figures">
        <Figure platform="threads" runway={runway.threads} today={today} muted={firstRun} />
        <Figure platform="instagram" runway={runway.instagram} today={today} muted={firstRun} />
        {firstRun ? (
          <span className="sq-t-aside sq-t-aside-chrome">Fills up after step 3. One tap covers a week.</span>
        ) : (
          <Link href="/queue" className="sq-btn sq-btn-light sq-t-open">
            Open queue
            <ArrowRightIcon />
          </Link>
        )}
      </div>
      <div className="sq-t-strips">
        <Strip platform="threads" runway={runway.threads} />
        <Strip platform="instagram" runway={runway.instagram} />
        <div className="sq-t-runrow" aria-hidden="true">
          <span className="sq-t-runlabel" />
          <div className="sq-t-cells sq-t-labels t-mono">
            {labels.map((l) => (
              <span
                key={l.col}
                className={l.tone === "gap" ? "sq-t-label-gap" : undefined}
                style={{ gridColumn: `${l.col} / span ${l.span}`, justifySelf: l.end ? "end" : undefined }}
              >
                {l.text}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
