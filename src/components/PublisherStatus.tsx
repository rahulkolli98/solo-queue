"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { publisherStatusView } from "@/lib/publisherStatus";
import { useBrowserTz } from "@/lib/useBrowserTz";
import { useNow } from "@/lib/useNow";
import { api } from "../../convex/_generated/api";

/**
 * Always-visible publisher state (dry run, live, paused or on hold for a vacation or a failed post), linking to the
 * Publishing log. Without it the only hint that posts are not going out lived
 * on a page nothing in the navigation linked to.
 */
export default function PublisherStatus({ compact = false }: { compact?: boolean }) {
  const now = useNow();
  const tz = useBrowserTz();
  const state = useQuery(api.publishLog.mode, { now, tz });
  if (!state) return null;
  const view = publisherStatusView(state);
  return (
    <Link
      href="/log"
      className={`sq-publisher${compact ? " sq-publisher-compact" : ""}`}
      data-tone={view.tone}
      aria-label={`Publisher: ${view.label.toLowerCase()}. ${view.hint} Open the publishing log.`}
    >
      {!compact && <span className="sq-eyebrow">Publisher</span>}
      <span className="sq-publisher-pill">{view.label}</span>
      {!compact && <small className="sq-publisher-hint">{view.hint}</small>}
    </Link>
  );
}
