import { resolveTz, zonedParts } from "../../convex/lib/zoned";

export type PublisherMode = "dry-run" | "live";

/** Why the queue is holding: a vacation (with its last day), or a failed post that needs a decision. */
export type PublisherHold = { reason: "vacation"; until: number } | { reason: "failure" };

export interface PublisherStatusView {
  /** The word shown in the pill. */
  label: "DRY RUN" | "LIVE" | "PAUSED" | "ON HOLD";
  /** One short plain sentence under it. */
  hint: string;
  tone: "dry" | "live" | "paused" | "hold";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "Mon 12 Oct": the day, in the founder's zone. */
export function formatHoldDay(ts: number, tz: string): string {
  const p = zonedParts(ts, resolveTz(tz));
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]}`;
}

/**
 * Plain-language publisher state for the shell: what the founder should believe about posting.
 * A manual pause beats everything; a hold (vacation, or a failed post) beats dry run and live,
 * because it is the reason nothing is going out.
 */
export function publisherStatusView(input: {
  mode: PublisherMode;
  paused: boolean;
  hold?: PublisherHold | null;
  tz?: string;
}): PublisherStatusView {
  if (input.paused) {
    return { label: "PAUSED", hint: "Posting is paused. Nothing goes out.", tone: "paused" };
  }
  if (input.hold?.reason === "vacation") {
    return {
      label: "ON HOLD",
      hint: `On vacation until ${formatHoldDay(input.hold.until, input.tz ?? "UTC")}.`,
      tone: "hold",
    };
  }
  if (input.hold?.reason === "failure") {
    return { label: "ON HOLD", hint: "Held: a post failed. Retry or cancel it.", tone: "hold" };
  }
  if (input.mode === "live") {
    return { label: "LIVE", hint: "Queued posts go out at their time.", tone: "live" };
  }
  return { label: "DRY RUN", hint: "Nothing is posted yet. Safe to test.", tone: "dry" };
}
