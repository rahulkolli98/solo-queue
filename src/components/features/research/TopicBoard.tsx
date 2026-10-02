"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { ArrowRightIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { readinessLabel } from "../../../../convex/lib/research";
import { refusalText } from "@/lib/refusalText";
import { sourceSummary } from "@/lib/researchBoard";
import { api } from "../../../../convex/_generated/api";
import AddSource from "./AddSource";
import AnglesRow from "./AnglesRow";
import BriefPaper from "./BriefPaper";
import SourceCards from "./SourceCards";
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
  onEdit,
}: {
  topic: BoardTopic;
  frames: Frame[];
  pillars: Pillar[];
  onEdit: () => void;
}) {
  const sources = useQuery(api.sources.listByTopic, { topicId: topic._id });
  const needsImages = (sources ?? []).some((s) => s.kind === "screenshot" && s.mediaAssetId);
  const media = useQuery(api.media.list, needsImages ? {} : "skip");
  const archive = useMutation(api.topics.archive);
  const unarchive = useMutation(api.topics.unarchive);
  const { toast } = useToast();

  const imageUrls = new Map((media ?? []).map((m) => [m._id as string, m.publicUrl]));
  const pillar = pillarOf(pillars, topic.pillar);

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
          <span className="t-eyebrow">
            Topic board · {sources ? sourceSummary(sources) : "…"}
            {pillar ? ` · ${pillar.name}` : ""}
          </span>
          <h2 className="rs-board-title">{topic.title}</h2>
          <span className="t-meta">
            {readinessLabel({ ready: topic.ready, needsMore: topic.needsMore })}
          </span>
        </div>
        <div className="rs-board-actions">
          <button type="button" className="sq-btn" onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="sq-btn" onClick={() => void onArchive()}>
            Archive
          </button>
          <Link href={`/studio/${topic._id}`} className="sq-btn sq-btn-primary">
            Send to Studio
            <ArrowRightIcon />
          </Link>
        </div>
      </div>

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
    </section>
  );
}
