import Link from "next/link";
import { heartbeatView, usagePercent } from "@/lib/publishLog";

type Platform = "threads" | "instagram";
const NAME: Record<Platform, string> = { threads: "Threads", instagram: "Instagram" };

function PlatformMark({ platform }: { platform: Platform }) {
  return (
    <span
      className={`sq-avatar ${platform === "threads" ? "sq-avatar-threads" : "sq-avatar-ig"}`}
      aria-hidden="true"
    >
      {platform === "threads" ? "@" : "▢"}
    </span>
  );
}

/** Board 07l, card 1: is the publisher alive? */
export function HeartbeatCard({
  heartbeat,
  mode,
}: {
  heartbeat: { ageSeconds: number; stale: boolean } | null;
  mode: "live" | "dry-run";
}) {
  const view = heartbeatView(heartbeat, mode);
  return (
    <section className="sq-log-card sq-log-card-dark" aria-label="Publisher heartbeat">
      <div className="sq-log-card-head">
        <h2 className="t-eyebrow">Heartbeat</h2>
        <span className={`sq-log-tag sq-log-tag-${view.kind}`}>{view.tag}</span>
      </div>
      <span className="t-figure sq-log-big">{view.label}</span>
      <span className="sq-log-note">
        Checks the queue every minute. Alarm after 3 minutes of silence.
      </span>
    </section>
  );
}

/** Board 07l, card 2: posts in the last 24 hours against Meta's daily limits. */
export function UsageCard({
  used,
  limits,
}: {
  used: Record<Platform, number>;
  limits: Record<Platform, number>;
}) {
  return (
    <section className="sq-log-card sq-log-card-yellow" aria-label="Posts in the last 24 hours">
      <h2 className="t-eyebrow">Last 24 hours</h2>
      {(["threads", "instagram"] as const).map((platform) => (
        <div key={platform} className="sq-log-meter">
          <div className="sq-log-meter-head">
            <PlatformMark platform={platform} />
            <span>{NAME[platform]}</span>
            <span className="t-mono sq-log-push">
              {used[platform]} / {limits[platform]}
            </span>
          </div>
          <div
            className="sq-log-meter-track"
            role="meter"
            aria-label={`${NAME[platform]} posts in the last 24 hours`}
            aria-valuemin={0}
            aria-valuemax={limits[platform]}
            aria-valuenow={used[platform]}
          >
            <div
              className="sq-log-meter-fill"
              style={{ width: `${usagePercent(used[platform], limits[platform])}%` }}
            />
          </div>
        </div>
      ))}
    </section>
  );
}

/** Board 07l, card 3: when each token is next refreshed. */
export function MetaCard({
  connections,
}: {
  connections: { platform: Platform; handle: string; status: "healthy" | "expiring" | "failed"; daysLeft: number }[];
}) {
  return (
    <section className="sq-log-card sq-log-card-blue" aria-label="Meta connection">
      <h2 className="t-eyebrow">Meta connection</h2>
      {connections.length === 0 && <span>Nothing connected yet.</span>}
      {connections.map((c) => (
        <div key={c.platform} className="sq-log-token">
          <span>{NAME[c.platform]} token</span>
          <span className="t-mono">
            {c.status === "failed" ? "NEEDS RECONNECT" : `REFRESH IN ${c.daysLeft} D`}
          </span>
        </div>
      ))}
      <Link href="/settings/connections" className="sq-btn sq-btn-sm">
        Manage connections
      </Link>
    </section>
  );
}
