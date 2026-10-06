import { slotCardLabel } from "@/lib/queueA11y";
import type { BoardCard } from "@/lib/queueBoard";
import AtRiskMark from "./AtRiskMark";
import StatusChip from "./StatusChip";

/** Per-column tilt and decoration so the tiles read as collage, not a grid. */
const TILTS = [-1.5, 1, -0.8, 1.4, -1, 0.8, -1.4];
const SHAPES = ["50%", "24px", "50% 50% 0 0"];

/** An Instagram post as a taped, tilted paper tile in its pillar colour (board 03). `dayLabel` ("Tue 6 Oct") puts the day in its accessible name. */
export default function IgTile({
  card,
  index,
  dayLabel,
  onOpen,
}: {
  card: BoardCard;
  index: number;
  dayLabel?: string;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={`sq-q-tile sq-q-st-${card.status}`}
      style={{ background: `var(--color-${card.pillarColor})`, transform: `rotate(${TILTS[index % TILTS.length]}deg)` }}
      onClick={() => onOpen(card._id)}
      data-slot-id={card._id}
      aria-label={slotCardLabel(card, dayLabel)}
    >
      <span className="sq-q-tile-tape" aria-hidden="true" />
      <span className="sq-q-tile-art" aria-hidden="true">
        <span className="sq-q-tile-blob" style={{ borderRadius: SHAPES[index % SHAPES.length] }} />
        <span className="sq-q-tile-dot" />
      </span>
      <span className="sq-q-tile-top">
        <span className="sq-q-tile-format">{(card.format ?? "post").toUpperCase()}</span>
        <StatusChip status={card.status} />
      </span>
      <AtRiskMark reason={card.atRisk} />
      <span className="sq-q-tile-bottom">
        <span className="sq-q-tile-title">{card.topicTitle}</span>
        <span className="t-meta">{card.time}</span>
      </span>
    </button>
  );
}
