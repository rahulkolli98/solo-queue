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

/** Every publish attempt of a slot, newest first (design.md: receipts table). */
export default function ReceiptsTable({ receipts, tz }: { receipts: Receipt[]; tz: string }) {
  return (
    <section className="sq-q-receipts" aria-labelledby="sq-q-receipts-h">
      <h3 id="sq-q-receipts-h" className="t-eyebrow">
        Receipts
      </h3>
      {receipts.length === 0 ? (
        <p className="sq-muted">No attempts yet. The publisher picks this up at its slot time.</p>
      ) : (
        <table className="sq-q-rtable">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Try</th>
              <th scope="col">Outcome</th>
              <th scope="col">Message</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((r, i) => (
              <tr key={r._id} className={r.outcome === "permanent" ? "sq-q-rfail" : undefined}>
                <td className="t-mono">{formatStamp(r.attemptedAt, tz).replace(/^\w+ /, "")}</td>
                <td className="t-mono">#{receipts.length - i}</td>
                <td>
                  <span className={`sq-pill ${PILL[r.outcome].cls}`}>{PILL[r.outcome].label}</span>
                </td>
                <td className="sq-muted">{r.providerMessage ?? "No message from the provider."}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
