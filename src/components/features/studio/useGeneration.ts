"use client";

import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type { GenState } from "@/components/features/studio/types";
import { refusalCode } from "@/lib/refusalText";
import { generateArgs } from "@/lib/studioCompose";
import type { GenerateSetup as GenerateSetupChoices } from "@/lib/studioSetup";
import { studioErrorText } from "@/lib/studioErrors";
import {
  formatElapsed,
  generationProgress,
  generationProgressSince,
  kindOfFormat,
  type Draft,
  type DraftKind,
  type GenerationProgress,
} from "@/lib/studioModel";
import { useNow } from "@/lib/useNow";

/** Wall clock, read only from event handlers and timers. */
const nowMs = () => Date.now();

/** A run the server still marks as writing after this long never ended (the server stopped), so it counts as over. */
const STALE_MS = 15 * 60_000;
const FAILED_SHOWN_MS = 60 * 60_000;

interface Run {
  kinds: DraftKind[];
  beforeIds: ReadonlySet<string>;
  startedAt: number;
  /** The story frame per format and the thread length chosen for this run (a retry uses the same). */
  setup?: GenerateSetupChoices;
}

/**
 * Runs `drafting.generate` and reports what has landed. The action returns
 * only after every format is written (tens of seconds), but each draft shows
 * up in the reactive drafts query as soon as it is stored, so progress is
 * "which requested kinds have a draft that was not there before".
 *
 * The run is also marked on the topic (`topic.generation`), so leaving the page and coming back, opening it on
 * another device or reloading still shows "writing", and then the drafts or why the run failed. The writing itself
 * never depended on the page: the server finishes it either way.
 */
export function useGeneration({
  topicId,
  latest,
  generation,
  onDone,
}: {
  topicId: string;
  latest: Partial<Record<DraftKind, Draft>>;
  /** The topic's own mark of a run in progress or that failed (`topic.generation`). */
  generation: Doc<"topics">["generation"];
  /** Called after a run finishes without error (drop local edits so the new text shows). */
  onDone: () => void;
}) {
  const generate = useAction(api.drafting.generate);
  const now = useNow();
  const [run, setRun] = useState<Run | null>(null);
  const [localRunning, setLocalRunning] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [failureCode, setFailureCode] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const runningRef = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  // What the server says: a run in progress (unless it is stale), or the reason the last one failed.
  const serverRunning = generation?.status === "running" && now - generation.startedAt < STALE_MS;
  // A failure is shown for an hour; after that it is old news and the next run starts clean.
  const serverFailed = generation?.status === "failed" && now - generation.startedAt < FAILED_SHOWN_MS;
  const serverKinds = (generation?.kinds ?? []).flatMap((f) => {
    const k = kindOfFormat(f);
    return k ? [k] : [];
  });
  const running = localRunning || serverRunning;

  // A run another page (or this page before it was left) started ended: show its drafts as the new text.
  const wasServerRunning = useRef(false);
  useEffect(() => {
    if (wasServerRunning.current && !serverRunning && !runningRef.current && !serverFailed) onDoneRef.current();
    wasServerRunning.current = serverRunning;
  }, [serverRunning, serverFailed]);

  const startedAt = run?.startedAt ?? generation?.startedAt ?? 0;
  useEffect(() => {
    if (!running || !startedAt) return;
    const tick = () => setElapsedMs(Math.max(0, nowMs() - startedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [running, startedAt]);

  async function start(kinds: DraftKind[], setup: GenerateSetupChoices | undefined, existingIds: string[]): Promise<void> {
    if (runningRef.current || serverRunning || kinds.length === 0) return;
    runningRef.current = true;
    const next: Run = { kinds, beforeIds: new Set(existingIds), startedAt: nowMs(), setup };
    setRun(next);
    setElapsedMs(0);
    setFailure(null);
    setFailureCode(null);
    setLocalRunning(true);
    try {
      const args = generateArgs({ topicId, kinds, setup });
      await generate({ ...args, topicId: topicId as Id<"topics"> });
      onDone();
    } catch (e) {
      setFailure(studioErrorText(e, "Generation failed."));
      setFailureCode(refusalCode(e));
    } finally {
      runningRef.current = false;
      setLocalRunning(false);
    }
  }

  // This page's own run when there is one, else the run the server knows about (started here earlier or elsewhere).
  const kinds = run?.kinds ?? serverKinds;
  const progress: GenerationProgress | null =
    run && localRunning
      ? generationProgress(run.kinds, latest, run.beforeIds)
      : generation && kinds.length > 0
        ? generationProgressSince(kinds, latest, generation.startedAt)
        : run
          ? generationProgress(run.kinds, latest, run.beforeIds)
          : null;
  const shownFailure = failure ?? (!running && serverFailed ? (generation?.error ?? "Generation failed.") : null);
  const shownFailureCode = failure !== null ? failureCode : !running && serverFailed ? (generation?.errorCode ?? null) : null;

  function genState(kind: DraftKind, existingIds: string[]): GenState {
    const requested = kinds.includes(kind);
    const fresh = progress?.fresh.includes(kind) ?? false;
    return {
      writing: running && requested && !fresh,
      error: !running && shownFailure && requested && !fresh ? shownFailure : null,
      errorCode: !running && shownFailure && requested && !fresh ? shownFailureCode : null,
      elapsed: formatElapsed(elapsedMs),
      retrying: running && requested && !fresh,
      onRetry: () => void start([kind], run?.setup, existingIds),
    };
  }

  /** Requested kinds the last run did not write (empty while running or after a clean run). */
  const failedKinds: DraftKind[] =
    !running && shownFailure && progress ? kinds.filter((k) => !progress.fresh.includes(k)) : [];

  /** Draft ids written in this session (not matched against the queue by title). */
  const freshIds = new Set<string>();
  for (const k of progress?.fresh ?? []) {
    const id = latest[k]?._id;
    if (id) freshIds.add(id);
  }

  return {
    start,
    running,
    progress: running ? progress : null,
    genState,
    freshIds,
    failure: shownFailure,
    failedKinds,
    retryFailed: (existingIds: string[]) => start(failedKinds, run?.setup, existingIds),
    /** Posts the running (or last) generation was asked for; undefined = the frame's own. */
    postCount: run?.setup?.threads?.count,
    elapsed: formatElapsed(elapsedMs),
  };
}
