import Link from "next/link";
import PlatformMark from "@/components/features/log/PlatformMark";
import { nextStep, receiptTime } from "@/lib/publishLog";

export interface Attempt {
  _id: string;
  attemptedAt: number;
  outcome: "success" | "retryable" | "permanent";
  providerMessage: string | null;
  slotId: string;
  /** Which try this was for its post: 1 for the first receipt, 2 for the next, and so on. */
  attempt: number;
  platform: "threads" | "instagram" | null;
  topicTitle: string | null;
  snippet: string;
}

const PILL: Record<Attempt["outcome"], string> = {
  success: "sq-pill sq-pill-ok",
  retryable: "sq-pill sq-pill-mid",
  permanent: "sq-pill sq-pill-bad",
};

/**
 * Board 07l: every publish attempt, newest first. Failed attempts show the provider's words and a
 * next step. One <tbody> per attempt, so below 768px (log.css) each attempt becomes its own card
 * (board M07l) instead of a sideways-scrolling table.
 */
export default function ReceiptsTable({
  attempts,
  now,
  tz,
}: {
  attempts: Attempt[];
  now: number;
  tz: string;
}) {
  if (attempts.length === 0) {
    return <p className="sq-muted">No attempts yet. They appear here as soon as the publisher touches a post.</p>;
  }
  return (
    <div className="sq-log-table-wrap">
      <table className="sq-log-table">
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">
              <span className="sq-sr">Platform</span>
            </th>
            <th scope="col">Post</th>
            <th scope="col">Try</th>
            <th scope="col">Outcome</th>
            <th scope="col">Message</th>
          </tr>
        </thead>
        {attempts.map((a) => {
          const failed = a.outcome !== "success" && a.providerMessage;
          const step = nextStep(a.outcome, a.providerMessage);
          const bad = a.outcome === "permanent" ? "sq-log-row-bad" : undefined;
          return (
            <tbody key={a._id} className={a.outcome === "permanent" ? "sq-log-rec sq-log-rec-bad" : "sq-log-rec"}>
              <tr className={bad}>
                <td className="t-mono sq-log-time">{receiptTime(a.attemptedAt, now, tz)}</td>
                <td className="sq-log-plat">{a.platform && <PlatformMark platform={a.platform} label />}</td>
                <td className="sq-log-title">
                  <Link href={`/queue?slot=${a.slotId}`} className="sq-log-post">
                    {a.topicTitle ?? "(deleted post)"}
                  </Link>
                </td>
                <td className="t-mono sq-log-try">
                  <span className="sq-log-wide">{`#${a.attempt}`}</span>
                  <span className="sq-log-narrow">{`· TRY ${a.attempt}`}</span>
                </td>
                <td className="sq-log-outcome">
                  <span className={PILL[a.outcome]}>{a.outcome.toUpperCase()}</span>
                </td>
                <td className="sq-log-message">{a.providerMessage ?? "-"}</td>
              </tr>
              {failed && (
                <tr className={bad}>
                  <td className="sq-log-gutter" />
                  <td colSpan={5}>
                    <div className="sq-log-detail t-mono">
                      <span className="sq-log-provider">PROVIDER · {a.providerMessage}</span>
                      {step && <span className="sq-log-next">NEXT · {step}</span>}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
