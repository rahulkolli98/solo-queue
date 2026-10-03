import type { SlotStatus } from "@/lib/queueBoard";

const LABEL: Record<SlotStatus, string> = {
  scheduled: "SCHEDULED",
  claimed: "CLAIMED",
  published: "PUBLISHED",
  failed: "FAILED",
};

/** Status of a slot as words, not colour alone: scheduled / claimed / published / failed. */
export default function StatusChip({ status }: { status: SlotStatus }) {
  return <span className={`sq-q-chip sq-q-chip-${status}`}>{LABEL[status]}</span>;
}

export function statusLabel(status: SlotStatus): string {
  return LABEL[status].toLowerCase();
}
