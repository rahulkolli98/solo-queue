import { slotCardLabel } from "@/lib/queueA11y";
import type { BoardCard } from "@/lib/queueBoard";
import AtRiskMark from "./AtRiskMark";
import StatusChip from "./StatusChip";

/**
 * A Threads post as a pillar-coloured mini card (board 03); a button that opens the slot drawer.
 * `dayLabel` ("Tue 6 Oct") puts the day in its accessible name.
 */
export default function ThreadsCard({
  card,
  dayLabel,
  onOpen,
}: {
  card: BoardCard;
  dayLabel?: string;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={`sq-q-mini sq-q-st-${card.status}`}
      style={{ background: `var(--color-${card.pillarColor})` }}
      onClick={() => onOpen(card._id)}
      data-slot-id={card._id}
      aria-label={slotCardLabel(card, dayLabel)}
    >
      <span className="sq-q-mini-top">
        <span className="t-meta">{card.time}</span>
        <StatusChip status={card.status} />
      </span>
      <AtRiskMark reason={card.atRisk} />
      <span className="sq-q-mini-text">{card.snippet || card.topicTitle}</span>
    </button>
  );
}
