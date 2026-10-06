import type { ReactNode } from "react";
import { AlertIcon, ArrowRightIcon, CheckIcon, ClockIcon } from "@/components/ui/icons";
import type { SlotStatus } from "@/lib/queueBoard";

const LABEL: Record<SlotStatus, string> = {
  scheduled: "SCHEDULED",
  claimed: "CLAIMED",
  published: "PUBLISHED",
  failed: "FAILED",
};

/** One icon per status (clock waits, arrow is in flight, tick is done, triangle failed): a second cue beside the word. */
const ICON: Record<SlotStatus, () => ReactNode> = {
  scheduled: ClockIcon,
  claimed: ArrowRightIcon,
  published: CheckIcon,
  failed: AlertIcon,
};

/** The icon for a slot status, hidden from assistive tech (the word beside it says it). */
export function StatusIcon({ status }: { status: SlotStatus }) {
  const Icon = ICON[status];
  return (
    <span className="sq-q-statusicon" aria-hidden="true">
      <Icon />
    </span>
  );
}

/** Status of a slot as an icon and a word, not colour alone: scheduled / claimed / published / failed. */
export default function StatusChip({ status }: { status: SlotStatus }) {
  return (
    <span className={`sq-q-chip sq-q-chip-${status}`}>
      <StatusIcon status={status} />
      {LABEL[status]}
    </span>
  );
}

export function statusLabel(status: SlotStatus): string {
  return LABEL[status].toLowerCase();
}
