"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { ArrowRightIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { readinessLabel } from "../../../../convex/lib/research";
import { refusalText } from "@/lib/refusalText";
import { sourceCountLabel, sourceSummary } from "@/lib/researchBoard";
import { postsOf, sendToStudioNote } from "@/lib/researchThread";
import { studioTopicHref } from "@/lib/studioHandoff";
import { latestByKind } from "@/lib/studioModel";
import { api } from "../../../../convex/_generated/api";
import FrameProposer from "../frames/FrameProposer";
import AddSource from "./AddSource";
import AnglesRow from "./AnglesRow";
import BriefPaper from "./BriefPaper";
import SourceCards from "./SourceCards";
import YourThread from "./YourThread";
import type { BoardTopic, Frame, Pillar } from "./types";
import { pillarOf } from "./types";

/**
 * The yellow collage board for the selected topic: the brief paper, its
 * clippings and three angles, with Edit / Archive / Send to Studio on top.
 */
export default function TopicBoard({
  topic,
  frames,
  pillars,
  timezone,
  onEdit,
}: {
  topic: BoardTopic;
  frames: Frame[];
  pillars: Pillar[];
  /** The saved time zone setting ("auto" or an IANA name), for slot times. */
  timezone?: string;
  onEdit: () => void;
}) {
  const sources = useQuery(api.sources.listByTopic, { topicId: topic._id });
  const drafts = useQuery(api.drafts.listByTopic, { topicId: topic._id });
  const threadDraft = drafts ? latestByKind(drafts).threads : undefined;
  const hasThread = Boolean(threadDraft && postsOf(threadDraft.body).some((p) => p.trim()));
  const needsImages = (sources ?? []).some((s) => s.kind === "screenshot" && s.mediaAssetId);
  const media = useQuery(api.media.list, needsImages ? {} : "skip");
  const archive = useMutation(api.topics.archive);
  const unarchive = useMutation(api.topics.unarchive);
  const { toast } = useToast();
  const [frameOpen, setFrameOpen] = useState(false);

  const imageUrls = new Map((media ?? []).map((m) => [m._id as string, m.publicUrl]));
  const pillar = pillarOf(pillars, topic.pillar);
  const readiness = readinessLabel({ ready: topic.ready, needsMore: topic.needsMore });

  async function onArchive() {
    try {
      await archive({ id: topic._id });
      toast({
        title: "Topic archived",
        detail: "It is out of the inbox. Nothing was deleted.",
        actions: [
          {
            label: "Undo",
            onClick: () => {
              void unarchive({ id: topic._id });
            },
          },
        ],
      });
    } catch (err) {
      toast({ title: "Could not archive", detail: refusalText(err, "Try again."), tone: "bad" });
    }
  }

  return (
    <section className="rs-board" aria-label="Topic board">
      <div className="rs-board-head">
        <div className="rs-board-titles">
          <div className="rs-phonehead">
            <span className="rs-tag" style={pillar ? { background: `var(--color-${pillar.color})` } : undefined}>
              {pillar ? pillar.name : "No pillar yet"}
            </span>
            <span className="t-meta rs-phonehead-ready">
              {topic.ready ? "● " : ""}
              {readiness} · {sourceCountLabel(topic.sourceCount)}
            </span>
          </div>
          <span className="t-eyebrow rs-long">
            <span>Topic board · </span>
            {sources ? sourceSummary(sources) : "…"}
            {pillar ? ` · ${pillar.name}` : ""}
          </span>
          <h2 className="rs-board-title">{topic.title}</h2>
          <span className="t-meta rs-long">{readiness}</span>
        </div>
        <div className="rs-board-actions">
          <button type="button" className="sq-btn" onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="sq-btn" onClick={() => void onArchive()}>
            Archive
          </button>
          <Link href={studioTopicHref(topic._id, "research")} className="sq-btn sq-btn-primary" aria-describedby="rs-send-note">
            Send to Studio
            <ArrowRightIcon />
          </Link>
        </div>
      </div>

      <p className="rs-sendnote" id="rs-send-note">
        {sendToStudioNote(hasThread, Boolean(topic.brief))}
      </p>

      <div className="rs-board-body">
        <BriefPaper topicId={topic._id} brief={topic.brief} editedAt={topic.briefEditedAt} />
        <div className="rs-sources">
          {sources === undefined ? (
            <p className="rs-status">Loading clippings…</p>
          ) : (
            <SourceCards sources={sources} imageUrls={imageUrls} />
          )}
          <AddSource topicId={topic._id} />
        </div>
      </div>

      <AnglesRow topicId={topic._id} angles={topic.angles} frames={frames} />

      <section className="rs-frame" aria-label="Story frame">
        <button
          type="button"
          className="rs-frame-toggle"
          aria-expanded={frameOpen}
          aria-controls="rs-frame-panel"
          onClick={() => setFrameOpen((open) => !open)}
        >
          Make a story frame from this topic or a post
        </button>
        {frameOpen && (
          <div className="rs-frame-panel" id="rs-frame-panel">
            <FrameProposer topic={{ id: topic._id, title: topic.title }} sources={["topic", "post"]} frames={frames} />
          </div>
        )}
      </section>

      <YourThread topicId={topic._id} timezone={timezone} />
    </section>
  );
}
