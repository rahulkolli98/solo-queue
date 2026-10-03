"use client";

import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { GenState } from "@/components/features/studio/types";
import { refusalCode } from "@/lib/refusalText";
import { studioErrorText } from "@/lib/studioErrors";
import {
  formatElapsed,
  generateFormatOf,
  generationProgress,
  type Draft,
  type DraftKind,
  type GenerationProgress,
} from "@/lib/studioModel";

/** Wall clock, read only from event handlers and timers. */
const nowMs = () => Date.now();

interface Run {
  kinds: DraftKind[];
  beforeIds: ReadonlySet<string>;
  startedAt: number;
  frameKey?: string;
}

/**
 * Runs `drafting.generate` and reports what has landed. The action returns
 * only after every format is written (tens of seconds), but each draft shows
 * up in the reactive drafts query as soon as it is stored, so progress is
 * "which requested kinds have a draft that was not there before".
 */
export function useGeneration({
  topicId,
  latest,
  onDone,
}: {
  topicId: string;
  latest: Partial<Record<DraftKind, Draft>>;
  /** Called after a run finishes without error (drop local edits so the new text shows). */
  onDone: () => void;
}) {
  const generate = useAction(api.drafting.generate);
  const [run, setRun] = useState<Run | null>(null);
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [failureCode, setFailureCode] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!running || !run) return;
    const tick = () => setElapsedMs(nowMs() - run.startedAt);
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [running, run]);

  async function start(kinds: DraftKind[], frameKey: string | undefined, existingIds: string[]): Promise<void> {
    if (runningRef.current || kinds.length === 0) return;
    runningRef.current = true;
    const next: Run = { kinds, beforeIds: new Set(existingIds), startedAt: nowMs(), frameKey };
    setRun(next);
    setElapsedMs(0);
    setFailure(null);
    setFailureCode(null);
    setRunning(true);
    try {
      await generate({
        topicId: topicId as Id<"topics">,
        formats: kinds.map(generateFormatOf),
        frameKey,
      });
      onDone();
    } catch (e) {
      setFailure(studioErrorText(e, "Generation failed."));
      setFailureCode(refusalCode(e));
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  const progress: GenerationProgress | null = run ? generationProgress(run.kinds, latest, run.beforeIds) : null;

  function genState(kind: DraftKind, existingIds: string[]): GenState {
    const requested = run?.kinds.includes(kind) ?? false;
    const fresh = progress?.fresh.includes(kind) ?? false;
    return {
      writing: running && requested && !fresh,
      error: !running && failure && requested && !fresh ? failure : null,
      errorCode: !running && failure && requested && !fresh ? failureCode : null,
      elapsed: formatElapsed(elapsedMs),
      retrying: running && requested && !fresh,
      onRetry: () => void start([kind], run?.frameKey, existingIds),
    };
  }

  /** Requested kinds the last run did not write (empty while running or after a clean run). */
  const failedKinds: DraftKind[] =
    !running && failure && run && progress ? run.kinds.filter((k) => !progress.fresh.includes(k)) : [];

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
    failure,
    failedKinds,
    retryFailed: (existingIds: string[]) => start(failedKinds, run?.frameKey, existingIds),
    elapsed: formatElapsed(elapsedMs),
  };
}
