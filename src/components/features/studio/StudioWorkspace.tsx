"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import AttachMediaDialog from "@/components/features/studio/AttachMediaDialog";
import BlogPanel from "@/components/features/studio/BlogPanel";
import CarouselPanel from "@/components/features/studio/CarouselPanel";
import FormatSetup from "@/components/features/studio/FormatSetup";
import InstagramColumn, { type IgTab } from "@/components/features/studio/InstagramColumn";
import PlatformNotice from "@/components/features/studio/PlatformNotice";
import ReplaceConfirm from "@/components/features/studio/ReplaceConfirm";
import { GenerateControls, StudioToolbar, type Pane } from "@/components/features/studio/StudioActions";
import StudioBottomBar from "@/components/features/studio/StudioBottomBar";
import StudioGuideStrip from "@/components/features/studio/StudioGuideStrip";
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
import { THREADS_POST_LIMIT, parseThread, postLength } from "@/lib/draftText";
import { kindsAtRisk, replaceQuestion, studioEntry } from "@/lib/studioCompose";
import { DEFAULT_FRAMES } from "../../../../convex/lib/framesModel";
import { withFormatDefault } from "../../../../convex/lib/formatSetup";
import { NO_FRAME, buildSetupRows, choicesForAngle, includedKinds, setupToSend, type SetupChoice, type SetupChoices } from "@/lib/studioSetup";
import { useToast } from "@/components/ui/Toast";
import { studioErrorText } from "@/lib/studioErrors";
import { RESEARCH_HANDOFF_PARAM, RESEARCH_HANDOFF_VALUE, angleBanner, parseAngle, researchBanner } from "@/lib/studioHandoff";
import { useDraftEditor } from "@/lib/useDraftEditor";
import {
  KIND_META,
  QUEUE_KINDS,
  barSummary,
  carouselMediaState,
  draftsNeedingFix,
  fixHeadline,
  formatWhen,
  latestByKind,
  mediaState,
  openSlots,
  readiness,
  saveLabel,
  studioGuide,
  type Asset,
  type DraftKind,
  type MediaState,
  type Readiness,
} from "@/lib/studioModel";

const BOARD_CARD_KIND: Record<string, DraftKind> = { thread: "threads", caption: "caption", reel: "reel", carousel: "carousel" };
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
  const createManual = useMutation(api.drafts.createManual);
  const updateSettings = useMutation(api.settings.update);
  const { toast } = useToast();

  const editor = useDraftEditor(
    (draftId, body) => saveDraft({ id: draftId as Id<"drafts">, body }),
    (e) => studioErrorText(e, "Couldn't save edits. Press Retry.")
  );
  const media = useMediaActions();

  // What the founder changed for this run, per format; anything not here follows the saved defaults.
  // "Draft this" on a Research angle opens Studio with only that format ticked and its frame picked.
  const [angle] = useState(() => parseAngle(search));
  // A carousel angle opens on the Instagram column's Carousel tab.
  const [pane, setPane] = useState<Pane>(() => (angle?.kind === "carousel" ? "instagram" : "threads"));
  const [igTab, setIgTab] = useState<IgTab>(() => (angle?.kind === "carousel" ? "carousel" : "reel"));
  const [choices, setChoices] = useState<SetupChoices>(() => (angle ? choicesForAngle(angle) : {}));
  const [setupOpen, setSetupOpen] = useState(false);
  const [attachKind, setAttachKind] = useState<"reel" | "caption" | null>(null);
  const [manualText, setManualText] = useState<Record<string, boolean>>({});
  const [researchDismissed, setResearchDismissed] = useState(false);
  // `?write=1` opens the Threads column straight into the writer; nothing is generated.
  const [writerOpen, setWriterOpen] = useState(() => studioEntry(search, 1).write);
  // "This replaces the thread you have written. Replace it?" while it waits for an answer.
  const [confirm, setConfirm] = useState<{ message: string; run: () => void } | null>(null);
  const confirmFrom = useRef<HTMLElement | null>(null);

  const latest = useMemo(() => (drafts ? latestByKind(drafts) : {}), [drafts]);
  // `media.list` is only the newest assets; look the attached ones up by id.
  const attachedIds = useMemo(
    () =>
      Object.values(latest)
        .flatMap((d) => [d.mediaAssetId, ...(d.mediaAssetIds ?? [])])
        .filter((x, i, all): x is Id<"mediaAssets"> => Boolean(x) && all.indexOf(x) === i),
    [latest]
  );
  const attached = useQuery(api.media.byIds, { ids: attachedIds });
  const existingIds = useMemo(() => (drafts ?? []).map((d) => d._id as string), [drafts]);
  const generation = useGeneration({ topicId, latest, onDone: () => editor.discard() });
  const queueWeek = useQueueWeek({
    topicId,
    tz: browserTz,
    prepare: async () => {
      await editor.flushAll();
      // flushAll settles even when a save fails; never queue the old server text.
      if (editor.hasUnsaved()) {
        throw new Error("Some edits didn't save, so nothing was queued. Fix the save error and try again.");
      }
    },
    onAttachMedia: (kind) => {
      // A carousel's images are drawn on its own tab, not attached from the library.
      if (kind === "carousel") {
        setPane("instagram");
        setIgTab("carousel");
      } else openAttach(kind === "caption" ? "caption" : "reel");
    },
  });

  // The default frames are created the first time the picker has nothing to show.
  const ensured = useRef(false);
  useEffect(() => {
    // Also when a newer default frame (such as the Instagram ones) is missing from an older install.
    if (frames && DEFAULT_FRAMES.some((d) => !frames.some((f) => f.key === d.key)) && !ensured.current) {
      ensured.current = true;
      void ensureDefaults();
    }
  }, [frames, ensureDefaults]);

  const threadsFrameKey = latest.threads?.frameKey;
  const rows = buildSetupRows({
    choices,
    defaults: settings?.voice.formatDefaults,
    legacyDefaultKey: settings?.voice.defaultFrameKey,
    legacyPostCount: settings?.voice.defaultPostCount,
    frames: frames ?? [],
    usedFrame: {
      threads: threadsFrameKey,
      caption: latest.caption?.frameKey,
      reel: latest.reel?.frameKey,
      carousel: latest.carousel?.frameKey,
    },
    hasDraft: { blog: Boolean(latest.blog) },
  });
  const threadsRow = rows.find((r) => r.kind === "threads");
  const beatsKey = threadsFrameKey ?? threadsRow?.frame?.key;
  const beatsFrame = useQuery(api.frames.getByKey, beatsKey ? { key: beatsKey } : "skip");
  const blogRow = rows.find((r) => r.kind === "blog");

  function choose(kind: DraftKind, change: SetupChoice) {
    setChoices((c) => ({ ...c, [kind]: { ...c[kind], ...change } }));
  }

  /** Keep this row as the default for next time. A settings patch replaces the whole voice section. */
  async function makeDefault(kind: DraftKind): Promise<void> {
    const row = rows.find((r) => r.kind === kind);
    if (!settings || !row) return;
    const formatDefaults = withFormatDefault(settings.voice.formatDefaults, kind, {
      include: row.include,
      frameKey: row.frame?.key,
      // Only a length the founder picked is kept; otherwise the thread keeps following its story frame.
      count: kind === "threads" ? choices.threads?.count : undefined,
    });
    const { formatDefaults: previous, ...rest } = settings.voice;
    void previous;
    try {
      await updateSettings({ patch: { voice: formatDefaults ? { ...rest, formatDefaults } : rest } });
      setChoices((c) => {
        const { [kind]: gone, ...others } = c;
        void gone;
        return others;
      });
    } catch (e) {
      toast({ title: "Couldn't save your default", detail: studioErrorText(e, "Try again."), tone: "bad" });
    }
  }

  /** Run now, or first ask once when it would replace text the founder already has. */
  function askThenRun(kinds: DraftKind[], run: () => void) {
    const atRisk = kindsAtRisk(kinds, latest, Boolean(manualText.threads));
    if (atRisk.length === 0) {
      run();
      return;
    }
    confirmFrom.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirm({ message: replaceQuestion(atRisk), run });
  }

  function closeConfirm() {
    setConfirm(null);
    const back = confirmFrom.current;
    confirmFrom.current = null;
    if (back?.isConnected) back.focus();
  }

  const kindsToWrite = includedKinds(rows);
  // `force` ticks a format for this call only (the carousel's own Write button writes it even when it is not ticked).
  const setupArgs = (force: DraftKind[] = []) =>
    setupToSend(rows.map((r) => (force.includes(r.kind) ? { ...r, include: true } : r)), {
      defaults: settings?.voice.formatDefaults,
      legacyPostCount: settings?.voice.defaultPostCount,
      frames: frames ?? [],
    });
  const generateAll = () => {
    const kinds = kindsToWrite;
    askThenRun(kinds, () => {
      // A run that writes only a carousel shows the carousel.
      if (kinds.length > 0 && kinds.every((k) => k === "carousel")) {
        setPane("instagram");
        setIgTab("carousel");
      }
      void generation.start(kinds, setupArgs(), existingIds);
    });
  };

  // Only `?draft=1` ("Save and draft both", inbox "Draft") writes the first batch, once, and only
  // for a topic with no drafts. `?write=1` and `?from=research` never start the model.
  const entryHandled = useRef(false);
  useEffect(() => {
    if (entryHandled.current || !topic || !drafts || !settings) return;
    if (search.get("draft") !== "1" && search.get("write") !== "1") return;
    entryHandled.current = true;
    const entry = studioEntry(search, drafts.length);
    router.replace(`/studio/${topicId}`);
    if (entry.generate) void generation.start(includedKinds(rows), setupArgs(), []);
  }, [topic, drafts, settings, search, router, topicId, generation, rows]);

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
  const assetById = new Map<string, Asset & { createdAt: number }>(
    [...(assets ?? []), ...(attached ?? [])].map((a) => [a._id, a])
  );
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

  const stateOf = (kind: "threads" | "caption" | "reel" | "carousel"): Readiness =>
    readiness({
      kind,
      body: bodyOf(kind),
      media:
        kind === "threads"
          ? "none"
          : kind === "carousel"
            ? carouselMediaState(latest.carousel, assetById, now)
            : mediaOf(kind).state,
      queued: queuedAtOf(kind) !== undefined,
    });
  // A carousel takes part in queueing only when this topic has one.
  const baseStates = { threads: stateOf("threads"), caption: stateOf("caption"), reel: stateOf("reel") };
  const states: typeof baseStates & { carousel?: Readiness } = {
    ...baseStates,
    ...(latest.carousel ? { carousel: stateOf("carousel") } : {}),
  };

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
  // Drafts that block queueing: over the limit, media, or a failed write. They drive the headline,
  // the Instagram footer and, on a phone, the other pane's switch ring and notice.
  const needFix = draftsNeedingFix(
    states,
    QUEUE_KINDS.filter((k) => !latest[k] && gen(k).error)
  );
  const threadsNeed = needFix.filter((k) => k === "threads").length;
  const igNeed = needFix.length - threadsNeed;
  const save = editor.summary(existingIds);
  const hasDrafts = Boolean(latest.threads || latest.caption || latest.reel || latest.blog);
  const threadPosts = latest.threads ? parseThread(bodyOf("threads") ?? "").length : 0;
  const igCount = (latest.caption ? 1 : 0) + (latest.reel ? 1 : 0);
  const beatLabels = (beatsFrame?.beats ?? []).map((b) => b.label);
  const attachDraft = attachKind ? latest[attachKind] : undefined;
  const threadBody = bodyOf("threads");
  const arrivedFromResearch = search.get(RESEARCH_HANDOFF_PARAM) === RESEARCH_HANDOFF_VALUE;
  const firstOverPost = threadBody ? parseThread(threadBody).findIndex((p) => postLength(p) > THREADS_POST_LIMIT) + 1 : 0;
  const guide = studioGuide({
    generating: generation.running,
    generationFailed: generation.failedKinds.length > 0 || Boolean(generation.failure && !hasDrafts),
    states,
    firstOverPost: firstOverPost > 0 ? firstOverPost : undefined,
    manualText: Object.values(manualText).some(Boolean),
    hasOpenSlot: board === undefined || slotsAll.length > 0,
    writerOpen,
    fromResearch: arrivedFromResearch,
  });
  const fromResearch = arrivedFromResearch && !researchDismissed;
  const research = angle ? angleBanner(KIND_META[angle.kind].noun) : researchBanner(hasDrafts, Boolean(topic?.brief));

  function openAttach(kind: "reel" | "caption") {
    setPane("instagram");
    setIgTab(kind);
    media.clearError();
    setAttachKind(kind);
  }

  function retrySave() {
    save.failed.forEach((draftId) => void editor.flush(draftId));
  }

  /** "Write it myself": store the text as the topic's draft; the editor takes over once it exists. */
  async function saveManual(kind: Exclude<DraftKind, "carousel">, text: string): Promise<void> {
    await createManual({ topicId: id, kind, body: text });
    setManualText((m) => ({ ...m, [kind]: false }));
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
      onManualText: (has: boolean) => setManualText((m) => ({ ...m, [kind]: has })),
      onSaveManual: (text: string) => saveManual(kind, text),
      bannedWords: settings?.voice.bannedWords,
    };
  }

  const headline = generation.running ? (
    <>
      both platforms <em>coming…</em>
    </>
  ) : needFix.length > 0 ? (
    <>
      {fixHeadline(needFix.length).lead} <em>{fixHeadline(needFix.length).accent}</em>
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
    <GenerateControls
      hasDrafts={hasDrafts || Boolean(latest.carousel)}
      running={generation.running}
      onGenerate={generateAll}
      nothingToWrite={kindsToWrite.length === 0}
    />
  );

  return (
    <>
      <div className="studio-head">
        <PageHeader
          eyebrow="Studio / new batch"
          kicker="One topic in —"
          headline={
            <>
              <span className="sq-sr">{topic.title}: </span>
              {headline}
            </>
          }
          actions={generateButton}
        />
      </div>
      <div className="studio-actions-phone">{generateButton}</div>
      <StudioToolbar
        saveText={saveLabel(save, tz)}
        saveFailed={save.state === "error"}
        onRetrySave={retrySave}
        pane={pane}
        onPane={setPane}
        counts={{ threads: threadPosts, instagram: igCount }}
        saved={save.state === "saved"}
        attention={{ threads: threadsNeed > 0 && pane !== "threads", instagram: igNeed > 0 && pane !== "instagram" }}
      />
      <StudioGuideStrip steps={guide.steps} />
      <FormatSetup
        rows={rows}
        open={setupOpen}
        onToggle={() => setSetupOpen((v) => !v)}
        disabled={generation.running}
        onInclude={(kind, include) => choose(kind, { include })}
        onFrame={(kind, frameKey) => choose(kind, frameKey === NO_FRAME ? { noFrame: true, frameKey: undefined } : { noFrame: false, frameKey })}
        onBrief={(kind, brief) => choose(kind, { brief })}
        onCount={(kind, count) => choose(kind, { count })}
        onMakeDefault={(kind) => void makeDefault(kind)}
      />

      {confirm && (
        <ReplaceConfirm
          message={confirm.message}
          onReplace={() => {
            const run = confirm.run;
            setConfirm(null);
            confirmFrom.current = null;
            run();
          }}
          onKeep={closeConfirm}
        />
      )}

      {fromResearch && (
        <Banner
          tone="blue"
          title={research.title}
          detail={research.detail}
          actions={[{ label: "Got it", onClick: () => setResearchDismissed(true) }]}
        />
      )}

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
          actions={[
            {
              label: "Retry",
              onClick: () => askThenRun(staleKinds, () => void generation.retryFailed(existingIds)),
              variant: "primary",
            },
          ]}
        />
      )}

      <div className="studio-grid" data-pane={pane}>
        <TopicColumn
          topic={topic}
          sources={sources}
          pillarName={settings?.pillars.find((p) => p.key === topic.pillar)?.name ?? topic.pillar}
          voice={settings?.voice.description}
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
          emptyCopy="Press Generate drafts and the thread lands here, or write it yourself."
          onManualText={(has) => setManualText((m) => ({ ...m, threads: has }))}
          onSaveManual={(text) => saveManual("threads", text)}
          writing={writerOpen}
          onWriting={setWriterOpen}
          expectedPosts={generation.running ? generation.postCount : undefined}
          bannedWords={settings?.voice.bannedWords}
          notice={
            pane === "threads" && igNeed > 0 ? (
              <PlatformNotice platform="Instagram" count={igNeed} onOpen={() => setPane("instagram")} />
            ) : undefined
          }
        />
        <InstagramColumn
          tab={igTab}
          onTab={setIgTab}
          draftCount={igCount}
          needCount={igNeed}
          notice={
            pane === "instagram" && threadsNeed > 0 ? (
              <PlatformNotice platform="Threads" count={threadsNeed} onOpen={() => setPane("threads")} />
            ) : undefined
          }
          panels={{ reel: igPanel("reel"), caption: igPanel("caption") }}
          carousel={
            <CarouselPanel
              topicId={topicId}
              draft={latest.carousel}
              gen={gen("carousel")}
              onWrite={() =>
                askThenRun(["carousel"], () => void generation.start(["carousel"], setupArgs(["carousel"]), existingIds))
              }
              bannedWords={settings?.voice.bannedWords}
            />
          }
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
          onWrite={() => void generation.start(["blog"], undefined, existingIds)}
          onSaveManual={(text) => saveManual("blog", text)}
        />
      </div>

      <StudioBottomBar
        summary={summary}
        slots={chips}
        slotsLoading={board === undefined}
        blogChecked={blogRow?.include ?? false}
        blogLocked={false}
        onBlog={(on) => choose("blog", { include: on })}
        onQueue={() => void queueWeek.queue(latest)}
        queuing={queueWeek.queuing}
        nextStep={guide.text}
        nextTone={guide.tone}
        savedText={save.state === "saved" ? saveLabel(save, tz) : undefined}
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
