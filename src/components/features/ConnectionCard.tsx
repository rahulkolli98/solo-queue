import type { ReactNode } from "react";
import { connectionHint } from "@/lib/connectionErrors";

export interface ConnectionInfo {
  platform: "threads" | "instagram";
  handle: string;
  scopes: string[];
  status: "healthy" | "expiring" | "failed";
  tokenExpiresAt: number;
  lastError: string | null;
}

const STATUS_LABEL: Record<ConnectionInfo["status"], string> = {
  healthy: "● Healthy",
  expiring: "● Expiring",
  failed: "● Failed",
};

function expiryLabel(ts: number): string {
  const days = Math.ceil((ts - Date.now()) / (24 * 3600 * 1000));
  if (days < 0) return "expired";
  if (days === 0) return "today";
  return `in ${days}d`;
}

export default function ConnectionCard({
  platform,
  connection,
  atRiskSlots,
  actions,
}: {
  platform: "threads" | "instagram";
  connection: ConnectionInfo | null;
  atRiskSlots: number;
  actions: ReactNode;
}) {
  const title = platform === "threads" ? "Threads" : "Instagram";
  return (
    <section className="sq-card" aria-label={`${title} connection`}>
      <div className="sq-card-h">
        <span
          className={`sq-avatar ${platform === "threads" ? "sq-avatar-threads" : "sq-avatar-ig"}`}
          aria-hidden="true"
        >
          {platform === "threads" ? "@" : "▢"}
        </span>
        <h2 className="sq-card-title">{title}</h2>
        {connection && (
          <span className="sq-tag" style={{ marginLeft: "auto" }}>
            {STATUS_LABEL[connection.status]}
          </span>
        )}
      </div>

      {!connection ? (
        <p className="sq-muted">
          Not connected. Connect your {title} account to let the queue publish
          for you.
        </p>
      ) : (
        <>
          <div className="sq-kv">
            <span>Account</span>
            <span className="sq-kv-mono">{connection.handle}</span>
          </div>
          <div className="sq-kv">
            <span>Token refresh</span>
            <span className="sq-kv-mono">{expiryLabel(connection.tokenExpiresAt)}</span>
          </div>
          <div>
            {connection.scopes.map((s) => (
              <span key={s} className="sq-chip">
                {s}
              </span>
            ))}
          </div>
          {connectionHint(platform, connection.status) && (
            <p className="sq-muted">
              {connectionHint(platform, connection.status)}
            </p>
          )}
          {connection.lastError && (
            <div className="sq-error-box" role="alert">
              {connection.lastError}
            </div>
          )}
          {connection.status === "failed" && atRiskSlots > 0 && (
            <div className="sq-error-box" role="alert">
              {atRiskSlots} scheduled {title} slot
              {atRiskSlots === 1 ? " is" : "s are"} at risk — reconnect or
              reschedule before {atRiskSlots === 1 ? "it" : "they"}{" "}
              {atRiskSlots === 1 ? "fails" : "fail"}.
            </div>
          )}
        </>
      )}

      <div className="sq-row">{actions}</div>
    </section>
  );
}
