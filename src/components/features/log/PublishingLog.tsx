"use client";

import { useAction, useQuery } from "convex/react";
import { useStableQuery } from "@/lib/useStableQuery";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import Banner from "@/components/ui/Banner";
import PageHeader from "@/components/ui/PageHeader";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { useToast } from "@/components/ui/Toast";
import LogSkeleton from "@/components/skeletons/LogSkeleton";
import { HeartbeatCard, MetaCard, UsageCard } from "@/components/features/log/LogCards";
import ReceiptsTable from "@/components/features/log/ReceiptsTable";
import { errorText } from "@/lib/errors";
import { OUTCOME_FILTERS, type OutcomeFilter } from "@/lib/publishLog";
import { useBrowserTz } from "@/lib/useBrowserTz";
import { useNow } from "@/lib/useNow";

/** The Publishing log (board 07l): is the publisher alive, how close to the limits, and every attempt. */
export default function PublishingLog() {
  const now = useNow();
  const tz = useBrowserTz();
  const { toast } = useToast();
  const [filter, setFilter] = useState<OutcomeFilter>("all");
  const [refreshing, setRefreshing] = useState(false);

  const status = useStableQuery(api.publishLog.status, { now });
  const attempts = useQuery(
    api.publishLog.attempts,
    filter === "all" ? { limit: 100 } : { outcome: filter, limit: 100 }
  );
  const refresh = useAction(api.connections.refresh);

  async function runRefresh() {
    if (!status || status.connections.length === 0) return;
    setRefreshing(true);
    try {
      const results = await Promise.all(
        status.connections.map(async (c) => ({ c, r: await refresh({ platform: c.platform }) }))
      );
      const bad = results.filter(({ r }) => r.status === "failed" || r.error);
      if (bad.length === 0) toast({ title: "Tokens checked", detail: "Both connections answered." });
      else
        toast({
          title: "Token refresh needs attention",
          detail: bad.map(({ c, r }) => `${c.platform}: ${r.error ?? r.status}`).join(" · "),
          tone: "bad",
          actions: [{ label: "Manage connections", href: "/settings", variant: "primary" }],
        });
    } catch (e) {
      toast({ title: "Could not refresh tokens", detail: errorText(e, "Try again."), tone: "bad" });
    } finally {
      setRefreshing(false);
    }
  }

  if (status === undefined) return <LogSkeleton />;

  return (
    <>
      <PageHeader
        eyebrow="Publishing log"
        headline={
          <>
            Every post, <em>every attempt.</em>
          </>
        }
        aside="What the publisher did, when, and what Meta said back."
        actions={
          <button
            type="button"
            className="sq-btn sq-btn-dark"
            onClick={runRefresh}
            disabled={refreshing || status.connections.length === 0}
          >
            {refreshing ? "Refreshing…" : "Run refresh now"}
          </button>
        }
      />

      {status.mode === "dry-run" && (
        <Banner
          tone="yellow"
          title="Dry run."
          detail="The publisher checks the queue every minute but posts nothing. Live publishing is switched on per deployment."
        />
      )}
      {status.paused.paused && (
        <Banner
          tone="coral"
          title="Publishing is paused."
          detail={status.paused.reason ?? "The publisher stopped after an error."}
          actions={[{ label: "Manage connections", href: "/settings", variant: "primary" }]}
        />
      )}

      <div className="sq-log-grid">
        <HeartbeatCard heartbeat={status.heartbeat} mode={status.mode} />
        <UsageCard used={status.usage24h} limits={status.limits} />
        <MetaCard connections={status.connections} />
      </div>

      <section className="sq-log-card sq-log-card-raised" aria-label="Receipts">
        <div className="sq-log-card-head">
          <h2 className="t-eyebrow">Receipts</h2>
          <SegmentedControl
            label="Filter by outcome"
            options={OUTCOME_FILTERS}
            value={filter}
            onChange={setFilter}
          />
        </div>
        <div aria-live="polite">
          {attempts === undefined ? (
            <p className="sq-muted">Loading attempts…</p>
          ) : (
            <ReceiptsTable attempts={attempts} now={now} tz={tz} />
          )}
        </div>
      </section>
    </>
  );
}
