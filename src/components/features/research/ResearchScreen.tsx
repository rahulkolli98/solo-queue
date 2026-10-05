"use client";

import { useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import ResearchSkeleton from "@/components/skeletons/ResearchSkeleton";
import { useHydrated } from "@/lib/useHydrated";
import { studioTopicHref } from "@/lib/studioHandoff";
import { useNow } from "@/lib/useNow";
import { pickSelected, researchHeadline, splitTopics } from "@/lib/researchBoard";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import CaptureBar from "./CaptureBar";
import EmptyBoard from "./EmptyBoard";
import TopicBoard from "./TopicBoard";
import TopicEditDrawer from "./TopicEditDrawer";
import TopicRail from "./TopicRail";

type DrawerState = null | { mode: "new" } | { mode: "edit"; id: string };

/**
 * Research (boards 04, 07i, 07j): capture bar, topic list and the open
 * topic's board. The open topic lives in the URL as ?topic=<id>.
 */
export default function ResearchScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydrated = useHydrated();
  const now = useNow();
  const topics = useQuery(api.topics.board);
  const settings = useQuery(api.settings.get);
  const frames = useQuery(api.frames.list);
  const [pillarFilter, setPillarFilter] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerState>(null);

  const requested = searchParams.get("topic");

  function select(id: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (id) next.set("topic", id);
    else next.delete("topic");
    const query = next.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }

  if (!hydrated || topics === undefined || settings === undefined) return <ResearchSkeleton />;

  const { active, sent, activeTotal } = splitTopics(topics, pillarFilter);
  const selected = pickSelected(topics, requested, active.length > 0 ? active : sent);
  const readyCount = topics.filter((t) => t.ready && t.status !== "queued" && t.status !== "done").length;
  const headline = researchHeadline(readyCount, topics.length);
  const editing = drawer?.mode === "edit" ? (topics.find((t) => t._id === drawer.id) ?? null) : null;
  const empty = topics.length === 0;

  return (
    <>
      <div className="rs-top">
        <span className="t-eyebrow rs-crumb">Research / Inbox</span>
        <CaptureBar lit={empty} onSaved={(id) => select(id)} />
      </div>

      <div className="rs-head">
        <PageHeader
          headline={
            <>
              {headline.before}
              <br />
              <em>{headline.rust}</em>
              {headline.after}
            </>
          }
          aside="Save links, quotes and half-thoughts all week. When a topic has enough behind it, send it to Studio and both platforms come out."
        />
      </div>

      <div className="rs-grid">
        <TopicRail
          active={active}
          sent={sent}
          activeTotal={activeTotal}
          pillars={settings.pillars}
          pillarFilter={pillarFilter}
          onFilter={setPillarFilter}
          selectedId={selected?._id ?? null}
          onSelect={select}
          onNew={() => setDrawer({ mode: "new" })}
          now={now}
        />
        <div className="rs-boardwrap">
          {selected ? (
            <TopicBoard
              key={selected._id}
              topic={selected}
              frames={frames ?? []}
              pillars={settings.pillars}
              onEdit={() => setDrawer({ mode: "edit", id: selected._id })}
            />
          ) : (
            <EmptyBoard />
          )}
        </div>
      </div>

      {drawer && (drawer.mode === "new" || editing) && (
        <TopicEditDrawer
          topic={editing}
          pillars={settings.pillars}
          onClose={() => setDrawer(null)}
          onSaved={(id: Id<"topics">, openStudio) => {
            setDrawer(null);
            if (openStudio) router.push(studioTopicHref(id, "research"));
            else select(id);
          }}
          onGone={() => {
            setDrawer(null);
            select(null);
          }}
        />
      )}
    </>
  );
}
