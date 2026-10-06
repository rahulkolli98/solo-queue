"use client";

import { useConvex, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import FilterChip from "@/components/ui/FilterChip";
import { useToast } from "@/components/ui/Toast";
import {
  blobFor,
  DRAFT_STATUS,
  draftMeta,
  matchesDraftFilter,
  matchesSearch,
  tiltFor,
  whenLabel,
  type DraftFilter,
} from "@/lib/libraryBoard";
import { copyText } from "@/lib/clipboard";
import { refusalText } from "@/lib/refusalText";
import { api } from "../../../../convex/_generated/api";
import { AttachDrawer, TrimDrawer } from "./DraftDrawers";
import LibraryRail from "./LibraryRail";
import { PostcardSkeletons } from "./PublishedTab";
import { pillarColorVar, type DraftCard, type Frame, type LibraryFilters, type Pillar } from "./types";

type Overlay = null | { kind: "trim"; card: DraftCard } | { kind: "attach"; card: DraftCard };

function DraftPostcard({
  card,
  index,
  pillars,
  pillarKey,
  tz,
  onTrim,
  onAttach,
}: {
  card: DraftCard;
  index: number;
  pillars: Pillar[];
  pillarKey: string;
  tz: string;
  onTrim: () => void;
  onAttach: () => void;
}) {
  const enqueue = useMutation(api.slots.enqueue);
  const convex = useConvex();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const status = DRAFT_STATUS[card.status];
  const isIg = card.platform === "instagram";
  const color = pillarColorVar(pillars, pillarKey);
  const pillarName = pillars.find((p) => p.key === pillarKey)?.name ?? "Build in public";

  async function onQueue() {
    setBusy(true);
    try {
      const res = await enqueue({ draftId: card.draftId, tz });
      toast({
        title: "Queued",
        detail: `Next free slot: ${whenLabel(res.scheduledAt, tz)}.`,
        actions: [{ label: "View queue", href: "/queue", variant: "primary" }],
      });
    } catch (err) {
      toast({ title: "Not queued", detail: refusalText(err, "Could not queue this draft."), tone: "bad" });
      setBusy(false);
    }
  }

  async function onCopy() {
    setBusy(true);
    try {
      const drafts = await convex.query(api.drafts.listByTopic, { topicId: card.topicId });
      const draft = drafts.find((d) => d._id === card.draftId);
      if (!draft) throw new Error("gone");
      if (!(await copyText(draft.body))) throw new Error("blocked");
      toast({ title: "Copied as Markdown", detail: "The blog draft is on your clipboard." });
    } catch {
      toast({ title: "Could not copy", detail: "Open it in Studio and copy from there.", tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  const onFix = status.action === "Trim" ? onTrim : status.action === "Attach" ? onAttach : status.action === "Queue next" ? () => void onQueue() : () => void onCopy();

  return (
    <article
      className={`lb-card ${isIg ? "" : "lb-card-th"} ${card.status === "OVER_LIMIT" ? "lb-card-bad" : ""} ${card.status === "BLOG" ? "lb-card-blog" : ""}`}
      style={{
        transform: `rotate(${tiltFor(index)}deg)`,
        ...(isIg ? { background: color } : {}),
      }}
    >
      <div className="lb-card-head">
        <span className="t-mono">{draftMeta(card.platform, card.format)}</span>
        <span className={`lb-pill lb-pill-${status.tone}`}>{status.label}</span>
      </div>
      {isIg ? (
        <>
          <span className="lb-blob" style={{ borderRadius: blobFor(index) }} aria-hidden="true" />
          <span className="lb-ig-text">{card.topicTitle}</span>
        </>
      ) : (
        <p className="lb-clip">{card.body}</p>
      )}
      <div className="lb-pillar">
        <span className="lb-dot" style={{ background: color }} aria-hidden="true" />
        <span className="t-meta">{pillarName.toUpperCase()}</span>
      </div>
      <div className="lb-actions">
        <Link href={`/studio/${card.topicId}`} className="lb-act">
          <span className="lb-lead">Open in&nbsp;</span>Studio
        </Link>
        <button type="button" className="lb-act lb-act-dark" disabled={busy} onClick={onFix} aria-label={status.action}>
          {shortAction(status.action)}
        </button>
      </div>
    </article>
  );
}

/** On phones the board shortens "Queue next" and "Copy .md" to their first word; the full label stays as the accessible name. */
function shortAction(action: string) {
  const [head, ...rest] = action.split(" ");
  return rest.length > 0 && (head === "Queue" || head === "Copy") ? (
    <>
      {head}
      <span className="lb-lead">{` ${rest.join(" ")}`}</span>
    </>
  ) : (
    action
  );
}

/** Library › Drafts: everything written that never got a slot, with the fix that matches why. */
export default function DraftsTab({
  filters,
  pillars,
  tz,
  frames,
  voice,
  learnedFrom,
}: {
  filters: LibraryFilters;
  pillars: Pillar[];
  tz: string;
  frames: Frame[] | undefined;
  voice: string;
  learnedFrom: number;
}) {
  const data = useQuery(api.library.drafts);
  const topics = useQuery(api.topics.list);
  const [filter, setFilter] = useState<DraftFilter>("all");
  const [overlay, setOverlay] = useState<Overlay>(null);

  const topicPillar = new Map((topics ?? []).map((t) => [t._id as string, t.pillar]));
  const pillarOfCard = (c: DraftCard) => {
    const key = topicPillar.get(c.topicId);
    return key && pillars.some((p) => p.key === key) ? key : "build";
  };

  const cards = (data?.cards ?? []).filter(
    (c) =>
      matchesDraftFilter(c.status, filter) &&
      (!filters.platform || c.platform === filters.platform) &&
      (!filters.pillar || pillarOfCard(c) === filters.pillar) &&
      matchesSearch([c.topicTitle, c.body], filters.search)
  );
  const counts = data?.counts;
  const narrowed = Boolean(filters.search.trim() || filters.pillar || filters.platform || filter !== "all");

  return (
    <div className="lb-grid">
      <div className="lb-main">
        <div className="lb-chiprow" role="group" aria-label="Filter drafts">
          <FilterChip pressed={filter === "all"} onClick={() => setFilter("all")}>
            All{counts ? ` · ${counts.all}` : ""}
          </FilterChip>
          <FilterChip pressed={filter === "fixing"} swatch="error" onClick={() => setFilter("fixing")}>
            Needs fixing{counts ? ` · ${counts.needsFixing}` : ""}
          </FilterChip>
          <FilterChip pressed={filter === "saved"} swatch="warning" onClick={() => setFilter("saved")}>
            Saved{counts ? ` · ${counts.saved}` : ""}
          </FilterChip>
        </div>
        <div className="lb-cards">
          {data === undefined ? (
            <PostcardSkeletons />
          ) : cards.length === 0 ? (
            <div className="lb-empty">
              <b>{narrowed ? "Nothing matches" : "No drafts waiting"}</b>
              <span>
                {narrowed
                  ? "Clear the search or the filters to see every draft."
                  : "Everything written has a slot. Drafts the queue skips, or that you save for later, wait here."}
              </span>
              {!narrowed && (
                <Link href="/studio" className="sq-btn sq-btn-dark">
                  Write something in Studio
                </Link>
              )}
            </div>
          ) : (
            cards.map((c, i) => (
              <DraftPostcard
                key={c.draftId}
                card={c}
                index={i}
                pillars={pillars}
                pillarKey={pillarOfCard(c)}
                tz={tz}
                onTrim={() => setOverlay({ kind: "trim", card: c })}
                onAttach={() => setOverlay({ kind: "attach", card: c })}
              />
            ))
          )}
        </div>
      </div>
      <LibraryRail
        frames={frames}
        voice={voice}
        learnedFrom={learnedFrom}
        summary={counts ? { fixing: counts.needsFixing, saved: counts.saved, blog: counts.blog } : undefined}
      />
      {overlay?.kind === "trim" && <TrimDrawer card={overlay.card} onClose={() => setOverlay(null)} />}
      {overlay?.kind === "attach" && <AttachDrawer card={overlay.card} onClose={() => setOverlay(null)} />}
    </div>
  );
}
