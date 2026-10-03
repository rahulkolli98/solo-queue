export type PublisherMode = "dry-run" | "live";

export interface PublisherStatusView {
  /** The word shown in the pill. */
  label: "DRY RUN" | "LIVE" | "PAUSED";
  /** One short plain sentence under it. */
  hint: string;
  tone: "dry" | "live" | "paused";
}

/** Plain-language publisher state for the shell: what the founder should believe about posting. */
export function publisherStatusView(input: { mode: PublisherMode; paused: boolean }): PublisherStatusView {
  if (input.paused) {
    return { label: "PAUSED", hint: "Posting is paused. Nothing goes out.", tone: "paused" };
  }
  if (input.mode === "live") {
    return { label: "LIVE", hint: "Queued posts go out at their time.", tone: "live" };
  }
  return { label: "DRY RUN", hint: "Nothing is posted yet. Safe to test.", tone: "dry" };
}
