"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import AttachMediaDialog from "@/components/features/studio/AttachMediaDialog";
import BlogPanel from "@/components/features/studio/BlogPanel";
import InstagramColumn, { type IgTab } from "@/components/features/studio/InstagramColumn";
import { GenerateButton, StudioToolbar, type Pane } from "@/components/features/studio/StudioActions";
import StudioBottomBar from "@/components/features/studio/StudioBottomBar";
import ThreadsColumn from "@/components/features/studio/ThreadsColumn";
import TopicColumn from "@/components/features/studio/TopicColumn";
import type { DraftView } from "@/components/features/studio/types";
import { useGeneration } from "@/components/features/studio/useGeneration";
import { useMediaActions } from "@/components/features/studio/useMediaActions";
import { useOpenSlots } from "@/components/features/studio/useOpenSlots";
import { useQueueWeek } from "@/components/features/studio/useQueueWeek";
import StudioSkeleton from "@/components/skeletons/StudioSkeleton";
import Banner from "@/components/ui/Banner";
import PageHeader from "@/components/ui/PageHeader";
import { parseThread } from "@/lib/draftText";
import { useDraftEditor } from "@/lib/useDraftEditor";
import {
  KIND_META,
  QUEUE_KINDS,
  barSummary,
  formatWhen,
  latestByKind,
  mediaState,
  openSlots,
  readiness,
  saveLabel,
  type Asset,
  type DraftKind,
  type MediaState,
  type Readiness,
} from "@/lib/studioModel";

const BOARD_CARD_KIND: Record<string, DraftKind> = { thread: "threads", caption: "caption", reel: "reel" };
const FALLBACK_BEATS = ["Hook", "Tension", "Turn", "Payoff"];

/** Board 02 and states 07d-07f: one topic's three columns, bottom bar and blog view. */
export default function StudioWorkspace({ topicId }: { topicId: string }) {
  const id = topicId as Id<"topics">;
  const router = useRouter();
  const search = useSearchParams();
  const topic = useQuery(api.topics.get, { id });
  const drafts = useQuery(api.drafts.listByTopic, { topicId: id });
  const sources = useQuery(api.sources.listByTopic, { topicId: id });
  const frames = useQuery(api.frames.list);
  const settings = useQuery(api.settings.get);
  const assets = useQuery(api.media.list);
  const { board, chips, tz, browserTz, now } = useOpenSlots();
  const ensureDefaults = useMutation(api.frames.ensureDefaults);
  const saveDraft = useMutation(api.drafts.update);

  const editor = useDraftEditor((draftId, body) => saveDraft({ id: draftId as Id<"drafts">, body }));
  const media = useMediaActions();

  const [pane, setPane] = useState<Pane>("threads");
  const [igTab, setIgTab] = useState<IgTab>("reel");
  const [chosenFrame, setChosenFrame] = useState<string | null>(null);
  const [blogOn, setBlogOn] = useState(false);
  const [attachKind, setAttachKind] = useState<"reel" | "caption" | null>(null);
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const latest = useMemo(() => (drafts ? latestByKind(drafts) : {}), [drafts]);
  const existingIds = useMemo(() => (drafts ?? []).map((d) => d._id as string), [drafts]);
  const generation = useGeneration({ topicId, latest, onDone: () => editor.discard() });
  const queueWeek = useQueueWeek({
    topicId,
    tz: browserTz,
    prepare: () => editor.flushAll(),
    onAttachMedia: (kind) => openAttach(kind === "caption" ? "caption" : "reel"),
  });

  // The default frames are created the first time the picker has nothing to show.
  const ensured = useRef(false);
  useEffect(() => {
    if (frames && frames.length === 0 && !ensured.current) {
      ensured.current = true;
      void ensureDefaults();
    }
  }, [frames, ensureDefaults]);

  const threadsFrameKey = latest.threads?.frameKey;
  const frameValue = chosenFrame ?? threadsFrameKey ?? settings?.voice.defaultFrameKey ?? "";
  const beatsFrame = useQuery(
    api.frames.getByKey,
    (threadsFrameKey ?? frameValue) ? { key: (threadsFrameKey ?? frameValue) as string } : "skip"
  );
  const pickedFrame = useQuery(api.frames.getByKey, frameValue ? { key: frameValue } : "skip");

  const blogKinds: DraftKind[] = blogOn || latest.blog ? ["blog"] : [];
  const generateAll = () => {
    setArmed(false);
    void generation.start([...QUEUE_KINDS, ...blogKinds], chosenFrame ?? (frameValue || undefined), existingIds);
  };

  // "Save and draft both" / inbox "Draft" arrive with ?draft=1: write the first batch once.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !topic || !drafts || search.get("draft") !== "1") return;
    autoStarted.current = true;
    router.replace(`/studio/${topicId}`);
    if (drafts.length === 0) void generation.start([...QUEUE_KINDS], undefined, []);
  }, [topic, drafts, search, router, topicId, generation]);

  useEffect(
    () => () => {
      if (armTimer.current) clearTimeout(armTimer.current);
    },
    []
  );

  if (topic === undefined || drafts === undefined) return <StudioSkeleton />;
  if (topic === null) {
    return (
      <div className="sq-error-screen">
        <h1>
          Topic <em>not found.</em>
        </h1>
        <p>It may have been deleted or archived. Pick another from your inbox.</p>
        <Link href="/studio" className="sq-btn sq-btn-primary">
          Back to Studio
        </Link>
      </div>
    );
  }

  // ----- derived state -----
  const assetById = new Map<string, Asset & { createdAt: number }>((assets ?? []).map((a) => [a._id, a]));
  const bodyOf = (kind: DraftKind) => {
    const d = latest[kind];
    return d ? editor.valueFor(d._id, d.body) : undefined;
  };
  const mediaOf = (kind: "caption" | "reel"): { state: MediaState; asset: Asset | undefined } => {
    const d = latest[kind];
    const asset = d?.mediaAssetId ? assetById.get(d.mediaAssetId) : undefined;
    return { state: mediaState(d?.mediaAssetId, asset, now), asset };
  };

  // Already queued: this page's queue run, else a slot on the board for this topic and format.
  const queuedAtOf = (kind: DraftKind): number | undefined => {
    const d = latest[kind];
    if (!d) return undefined;
    if (queueWeek.queuedAt[d._id] !== undefined) return queueWeek.queuedAt[d._id];
    if (generation.freshIds.has(d._id) || !board) return undefined;
    const hits = board.days
      .flatMap((day) => [...day.threads, ...day.instagram])
      .filter((c) => c.topicTitle === topic.title && BOARD_CARD_KIND[c.format ?? ""] === kind && c.status !== "failed");
    return hits.length ? Math.min(...hits.map((c) => c.scheduledAt)) : undefined;
  };

  const stateOf = (kind: "threads" | "caption" | "reel"): Readiness =>
    readiness({
      kind,
      body: bodyOf(kind),
      media: kind === "threads" ? "none" : mediaOf(kind).state,
      queued: queuedAtOf(kind) !== undefined,
    });
  const states = { threads: stateOf("threads"), caption: stateOf("caption"), reel: stateOf("reel") };

  const days = board?.days ?? [];
  const slotsAll = openSlots(days, 200);
  const threadsTarget = slotsAll.find((s) => s.platform === "threads");
  const igSlots = slotsAll.filter((s) => s.platform === "instagram");
  const igTarget = (kind: "caption" | "reel") => {
    const slot = igSlots[kind === "reel" && states.caption.state === "ready" ? 1 : 0];
    return slot ? { when: slot.when, gap: slot.gap } : undefined;
  };
  const whenOf = (kind: DraftKind) => {
    const at = queuedAtOf(kind);
    return at === undefined ? null : formatWhen(at, tz);
  };

  const viewOf = (kind: DraftKind): DraftView | undefined => {
    const d = latest[kind];
    if (!d) return undefined;
    return {
      draft: d,
      body: editor.valueFor(d._id, d.body),
      onChange: (body) => editor.change(d._id, body),
      onBlur: () => void editor.flush(d._id),
    };
  };

  // A failed regenerate leaves the old drafts on screen, so say so; missing ones get their own error card.
  const staleKinds = generation.failedKinds.filter((k) => latest[k]);
  const gen = (kind: DraftKind) => generation.genState(kind, existingIds);
  const summary = barSummary({
    states,
    generating: generation.running,
    progress: generation.progress ? { done: generation.progress.done, total: generation.progress.total } : undefined,
    emptySub: "GENERATE TO START",
  });
  const save = editor.summary(existingIds);
  const hasDrafts = Boolean(latest.threads || latest.caption || latest.reel || latest.blog);
  const threadPosts = latest.threads ? parseThread(bodyOf("threads") ?? "").length : 0;
  const igCount = (latest.caption ? 1 : 0) + (latest.reel ? 1 : 0);
  const beatLabels = (beatsFrame?.beats ?? pickedFrame?.beats ?? []).map((b) => b.label);
  const attachDraft = attachKind ? latest[attachKind] : undefined;

  function openAttach(kind: "reel" | "caption") {
    setPane("instagram");
    setIgTab(kind);
    media.clearError();
    setAttachKind(kind);
  }

  function onGenerateTap() {
    if (!hasDrafts || armed) {
      generateAll();
      return;
    }
    setArmed(true);
    armTimer.current = setTimeout(() => setArmed(false), 4000);
  }

  function retrySave() {
    save.failed.forEach((draftId) => void editor.flush(draftId));
  }

  function igPanel(kind: "caption" | "reel") {
    return {
      kind,
      view: viewOf(kind),
      readiness: states[kind],
      mediaState: mediaOf(kind).state,
      asset: mediaOf(kind).asset,
      media,
      onAttach: () => openAttach(kind),
      gen: gen(kind),
      target: igTarget(kind),
      queuedWhen: whenOf(kind),
    };
  }

  const headline = generation.running ? (
    <>
      both platforms <em>coming…</em>
    </>
  ) : hasDrafts ? (
    <>
      both platforms <em>out.</em>
    </>
  ) : (
    <>
      ready to <em>draft.</em>
    </>
  );
  const generateButton = (
    <GenerateButton hasDrafts={hasDrafts} running={generation.running} armed={armed} onGenerate={onGenerateTap} />
  );

  return (
    <>
      <div className="studio-head">
        <PageHeader eyebrow="Studio / new batch" kicker="One topic in —" headline={headline} actions={generateButton} />
      </div>
      <div className="studio-actions-phone">{generateButton}</div>
      <StudioToolbar
        saveText={saveLabel(save, tz)}
        saveFailed={save.state === "error"}
        onRetrySave={retrySave}
        pane={pane}
        onPane={setPane}
        counts={{ threads: threadPosts, instagram: igCount }}
      />

      {save.state === "error" && (
        <Banner
          tone="coral"
          title="Couldn't save your edits."
          detail={save.error}
          actions={[{ label: "Retry", onClick: retrySave, variant: "primary" }]}
        />
      )}

      {staleKinds.length > 0 && (
        <Banner
          tone="coral"
          title="Couldn't write new drafts."
          detail={`${generation.failure} Your earlier ${staleKinds.length === 1 ? KIND_META[staleKinds[0]].noun : "drafts"} ${staleKinds.length === 1 ? "stays" : "stay"} as ${staleKinds.length === 1 ? "it was" : "they were"}.`}
          actions={[{ label: "Retry", onClick: () => void generation.retryFailed(existingIds), variant: "primary" }]}
        />
      )}

      <div className="studio-grid" data-pane={pane}>
        <TopicColumn
          topic={topic}
          sources={sources}
          pillarName={settings?.pillars.find((p) => p.key === topic.pillar)?.name ?? topic.pillar}
          frames={frames}
          frameValue={frameValue}
          onFrame={setChosenFrame}
          beatLabels={beatLabels}
          voice={settings?.voice.description}
          busy={generation.running}
        />
        <ThreadsColumn
          view={viewOf("threads")}
          beats={beatsFrame?.beats}
          frameName={beatsFrame?.name}
          readiness={states.threads}
          target={threadsTarget?.when}
          queuedWhen={whenOf("threads")}
          gen={gen("threads")}
          placeholders={beatLabels.length ? beatLabels : FALLBACK_BEATS}
          emptyCopy="Generate and the thread lands here."
        />
        <InstagramColumn
          tab={igTab}
          onTab={setIgTab}
          draftCount={igCount}
          panels={{ reel: igPanel("reel"), caption: igPanel("caption") }}
        />
        <BlogPanel
          view={viewOf("blog")}
          topicTitle={topic.title}
          threadsCount={threadPosts}
          onTab={(tab) => {
            if (tab === "threads") setPane("threads");
            else {
              setPane("instagram");
              setIgTab(tab);
            }
          }}
          gen={gen("blog")}
          writing={generation.running}
          onWrite={() => void generation.start(["blog"], chosenFrame ?? undefined, existingIds)}
        />
      </div>

      <StudioBottomBar
        summary={summary}
        slots={chips}
        slotsLoading={board === undefined}
        blogChecked={blogOn || Boolean(latest.blog)}
        blogLocked={Boolean(latest.blog)}
        onBlog={setBlogOn}
        onQueue={() => void queueWeek.queue(latest)}
        queuing={queueWeek.queuing}
      />

      <AttachMediaDialog
        open={attachKind !== null}
        onClose={() => setAttachKind(null)}
        assets={assets}
        draftId={attachDraft?._id ?? null}
        currentAssetId={attachDraft?.mediaAssetId}
        forLabel={attachKind === "caption" ? "caption" : "reel script"}
        now={now}
        media={media}
      />
    </>
  );
}
