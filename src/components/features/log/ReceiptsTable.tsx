import Link from "next/link";
import { Fragment } from "react";
import { nextStep, receiptTime } from "@/lib/publishLog";

export interface Attempt {
  _id: string;
  attemptedAt: number;
  outcome: "success" | "retryable" | "permanent";
  providerMessage: string | null;
  slotId: string;
  platform: "threads" | "instagram" | null;
  topicTitle: string | null;
  snippet: string;
}

const PILL: Record<Attempt["outcome"], string> = {
  success: "sq-pill sq-pill-ok",
  retryable: "sq-pill sq-pill-mid",
  permanent: "sq-pill sq-pill-bad",
};

/** Board 07l: every publish attempt, newest first. Failed attempts show the provider's words and a next step. */
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
            <th scope="col">Outcome</th>
            <th scope="col">Message</th>
          </tr>
        </thead>
        <tbody>
          {attempts.map((a) => {
            const failed = a.outcome !== "success" && a.providerMessage;
            const step = nextStep(a.outcome, a.providerMessage);
            return (
              <Fragment key={a._id}>
                <tr className={a.outcome === "permanent" ? "sq-log-row-bad" : undefined}>
                  <td className="t-mono">{receiptTime(a.attemptedAt, now, tz)}</td>
                  <td>
                    {a.platform && (
                      <span
                        className={`sq-avatar ${a.platform === "threads" ? "sq-avatar-threads" : "sq-avatar-ig"}`}
                        role="img"
                        aria-label={a.platform === "threads" ? "Threads" : "Instagram"}
                      >
                        {a.platform === "threads" ? "@" : "▢"}
                      </span>
                    )}
                  </td>
                  <td>
                    <Link href={`/queue?slot=${a.slotId}`} className="sq-log-post">
                      {a.topicTitle ?? "(deleted post)"}
                    </Link>
                  </td>
                  <td>
                    <span className={PILL[a.outcome]}>{a.outcome.toUpperCase()}</span>
                  </td>
                  <td className="sq-log-message">{a.providerMessage ?? "-"}</td>
                </tr>
                {failed && (
                  <tr className={a.outcome === "permanent" ? "sq-log-row-bad" : undefined}>
                    <td />
                    <td colSpan={4}>
                      <div className="sq-log-detail t-mono">
                        <span>PROVIDER · {a.providerMessage}</span>
                        {step && <span className="sq-log-next">NEXT · {step}</span>}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
