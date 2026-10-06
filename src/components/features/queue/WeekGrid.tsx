import { dayGroupLabel } from "@/lib/queueA11y";
import { PLATFORM_NAME, shortDay, type BoardDay, type Platform, type PlatformFilter } from "@/lib/queueBoard";
import IgTile from "./IgTile";
import OpenSlot, { OpenTile } from "./OpenSlot";
import PlatformGlyph from "./PlatformGlyph";
import ThreadsCard from "./ThreadsCard";

/** "N THIS WEEK", or "0 OF M FILLED" while nothing is queued (board 07h). */
function laneCount(days: BoardDay[], platform: Platform): string {
  const posts = days.reduce((n, d) => n + d[platform].length, 0);
  if (posts > 0) return `${posts} THIS WEEK`;
  const open = days.reduce((n, d) => n + d.open[platform].length, 0);
  return `0 OF ${open} FILLED`;
}

function ThreadsCell({ day, onOpen }: { day: BoardDay; onOpen: (id: string) => void }) {
  const label = shortDay(day.key);
  const empty = day.threads.length === 0 && day.open.threads.length === 0;
  return (
    <div className="sq-q-cell sq-q-cell-threads">
      {day.threads.map((c) => (
        <ThreadsCard key={c._id} card={c} dayLabel={label} onOpen={onOpen} />
      ))}
      {day.open.threads.map((time) => (
        <OpenSlot key={time} platform="threads" time={time} dayLabel={label} dayKey={day.key} />
      ))}
      {empty && <span className="sq-q-noslot t-tag-sm">NO SLOT</span>}
    </div>
  );
}

function InstagramCell({ day, column, onOpen }: { day: BoardDay; column: number; onOpen: (id: string) => void }) {
  const label = shortDay(day.key);
  const empty = day.instagram.length === 0 && day.open.instagram.length === 0;
  return (
    <div className="sq-q-cell sq-q-cell-ig">
      {day.instagram.map((c) => (
        <IgTile key={c._id} card={c} index={column} dayLabel={label} onOpen={onOpen} />
      ))}
      {day.instagram.length === 0 && day.open.instagram.length > 0 && (
        <OpenTile times={day.open.instagram} dayLabel={label} dayKey={day.key} />
      )}
      {day.instagram.length > 0 &&
        day.open.instagram.map((time) => (
          <OpenSlot key={time} platform="instagram" time={time} dayLabel={label} dayKey={day.key} variant="chip" />
        ))}
      {empty && <span className="sq-q-noslot t-tag-sm">NO SLOT</span>}
    </div>
  );
}

/**
 * The week as seven day columns beside a platform lane (board 03): Threads
 * cards stacked on top, Instagram collage tiles below. One CSS grid, so the
 * lane labels stay level with their rows however many cards a day holds.
 */
export default function WeekGrid({
  days,
  platform,
  onOpen,
}: {
  days: BoardDay[];
  platform: PlatformFilter;
  onOpen: (id: string) => void;
}) {
  const showThreads = platform !== "instagram";
  const showIg = platform !== "threads";
  const threadsRow = 2;
  const igRow = showThreads ? 3 : 2;
  return (
    <div className={`sq-q-grid sq-q-grid-${platform}`}>
      {showThreads && (
        <div className="sq-q-lane" style={{ gridColumn: 1, gridRow: threadsRow }}>
          <PlatformGlyph platform="threads" />
          <span>{PLATFORM_NAME.threads}</span>
          <span className="t-meta sq-q-lane-count">{laneCount(days, "threads")}</span>
        </div>
      )}
      {showIg && (
        <div className="sq-q-lane" style={{ gridColumn: 1, gridRow: igRow }}>
          <PlatformGlyph platform="instagram" />
          <span>{PLATFORM_NAME.instagram}</span>
          <span className="t-meta sq-q-lane-count">{laneCount(days, "instagram")}</span>
        </div>
      )}
      {days.map((day, i) => {
        const [dow, date] = day.label.split(" ");
        return (
          <div
            key={day.key}
            className="sq-q-daycol"
            style={{ gridColumn: i + 2, gridRow: `1 / span ${1 + Number(showThreads) + Number(showIg)}` }}
            role="group"
            aria-label={dayGroupLabel(day, platform)}
          >
            {/* The group already names the day; the head is the sighted label for it. */}
            <div className={`sq-q-dayhead${day.isToday ? " sq-q-dayhead-today" : ""}`} aria-hidden="true">
              <span className="t-mono">{dow}</span>
              <span className="sq-q-daynum">{date}</span>
              <span className="sq-sr">{day.isToday ? ", today" : ""}</span>
            </div>
            {showThreads && <ThreadsCell day={day} onOpen={onOpen} />}
            {showIg && <InstagramCell day={day} column={i} onOpen={onOpen} />}
          </div>
        );
      })}
    </div>
  );
}
