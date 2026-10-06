import { formatStamp } from "@/lib/queueBoard";

export interface Receipt {
  _id: string;
  attemptedAt: number;
  outcome: "success" | "retryable" | "permanent";
  providerMessage: string | null;
}

const PILL: Record<Receipt["outcome"], { cls: string; label: string }> = {
  success: { cls: "sq-pill-ok", label: "SUCCESS" },
  retryable: { cls: "sq-pill-mid", label: "RETRYABLE" },
  permanent: { cls: "sq-pill-bad", label: "PERMANENT" },
};

/** Every publish attempt of a slot, newest first: a headerless list of mono time, outcome pill and message (design.md drawer). */
export default function ReceiptsTable({ receipts, tz }: { receipts: Receipt[]; tz: string }) {
  return (
    <section className="sq-q-receipts" aria-labelledby="sq-q-receipts-h">
      <h3 id="sq-q-receipts-h" className="t-eyebrow">
        Receipts
      </h3>
      {receipts.length === 0 ? (
        <p className="sq-muted">No attempts yet. The publisher picks this up at its slot time.</p>
      ) : (
        <ul className="sq-q-rlist">
          {receipts.map((r, i) => (
            <li key={r._id} className={`sq-q-rrow${r.outcome === "permanent" ? " sq-q-rfail" : ""}`}>
              <span className="t-mono sq-q-rtime">
                {formatStamp(r.attemptedAt, tz).replace(/^\w+ /, "")}
                <span className="sq-q-rtry"> · TRY {receipts.length - i}</span>
              </span>
              <span className={`sq-pill ${PILL[r.outcome].cls}`}>{PILL[r.outcome].label}</span>
              <span className="sq-muted sq-q-rmsg">{r.providerMessage ?? "No message from the provider."}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
