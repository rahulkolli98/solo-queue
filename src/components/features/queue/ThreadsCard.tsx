import { PLATFORM_NAME, type BoardCard } from "@/lib/queueBoard";
import StatusChip, { statusLabel } from "./StatusChip";

/** A Threads post as a pillar-coloured mini card (board 03); a button that opens the slot drawer. */
export default function ThreadsCard({ card, onOpen }: { card: BoardCard; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      className={`sq-q-mini sq-q-st-${card.status}`}
      style={{ background: `var(--color-${card.pillarColor})` }}
      onClick={() => onOpen(card._id)}
      aria-label={`${PLATFORM_NAME[card.platform]} post at ${card.time}, ${card.topicTitle}, ${statusLabel(card.status)}. Open details.`}
    >
      <span className="sq-q-mini-top">
        <span className="t-meta">{card.time}</span>
        <StatusChip status={card.status} />
      </span>
      <span className="sq-q-mini-text">{card.snippet || card.topicTitle}</span>
    </button>
  );
}
