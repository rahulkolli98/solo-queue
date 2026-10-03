import type { ResearchFailure } from "@/lib/researchErrors";

/**
 * The line under the brief paper and the angles row: progress while a call
 * runs, or its failure: the message whole, then the next step.
 */
export default function ResearchStatus({
  busyText,
  failure,
  plainError,
}: {
  /** Shown while the call runs ("Writing the brief…"). */
  busyText?: string;
  failure?: ResearchFailure | null;
  /** A one-line error with no next step (saving the brief). */
  plainError?: string | null;
}) {
  if (failure) {
    return (
      <p className="rs-status rs-status-failure" role="alert" data-bad="true">
        <span className="rs-status-reason">{failure.message}</span>
        <span className="rs-status-next">{failure.next}</span>
      </p>
    );
  }
  return (
    <p className="rs-status" aria-live="polite" data-bad={plainError ? true : undefined}>
      {busyText ?? plainError ?? ""}
    </p>
  );
}
