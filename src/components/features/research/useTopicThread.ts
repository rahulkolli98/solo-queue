"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { cleanThread } from "@/lib/draftText";
import { refusalCode, refusalText } from "@/lib/refusalText";
import {
  displayTz,
  postsOf,
  queuedForText,
  saveState,
  threadBody,
  threadChanged,
  threadChecks,
  type SaveState,
  type ThreadChecks,
} from "@/lib/researchThread";
import { studioTopicHref } from "@/lib/studioHandoff";
import { latestByKind } from "@/lib/studioModel";
import { useBrowserTz } from "@/lib/useBrowserTz";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

/** How far ahead to look for this thread's slot in the queue. */
const QUEUE_DAYS = 31;

export interface TopicThread {
  status: "loading" | "ready" | "gone";
  goneReason?: "deleted" | "archived";
  posts: string[];
  onChange: (posts: string[]) => void;
  hasThread: boolean;
  save: SaveState;
  checks: ThreadChecks;
  saving: boolean;
  queuing: boolean;
  /** "Queued for Mon 5 Oct, 19:00", or "Queued" when the time is not known here. */
  queuedLabel: string | null;
  error: string | null;
  /** Studio has a newer version of the thread than the one being edited. */
  studioNewer: boolean;
  useStudioVersion: () => void;
  saveNow: () => void;
  queue: () => void;
  /** Called when focus leaves the section: keeps unsaved text. */
  leave: () => void;
  openInStudio: () => void;
  studioHref: string;
}

interface Edit {
  /** The stored text this edit started from. */
  base: string;
  posts: string[];
}

/**
 * The thread of one Research topic: the same draft Studio shows (the topic's
 * latest Threads draft), edited post by post here. The founder's edit lives in
 * local state until it is saved; stored text wins whenever nothing is unsaved.
 */
export function useTopicThread(topicId: Id<"topics">, timezone: string | undefined): TopicThread {
  const router = useRouter();
  const { toast } = useToast();
  const browserTz = useBrowserTz();
  const tz = displayTz(timezone, browserTz);

  const topic = useQuery(api.topics.get, { id: topicId });
  const drafts = useQuery(api.drafts.listByTopic, { topicId });
  const [from] = useState(() => Date.now() - 86_400_000);
  const week = useQuery(api.slots.week, { from, days: QUEUE_DAYS });
  const createManual = useMutation(api.drafts.createManual);
  const updateDraft = useMutation(api.drafts.update);
  const enqueue = useMutation(api.slots.enqueue);

  const [edit, setEdit] = useState<Edit | null>(null);
  const [saving, setSaving] = useState(false);
  const [queuing, setQueuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justQueued, setJustQueued] = useState<{ draftId: string; at: number | null } | null>(null);
  const busy = useRef(false);

  const draft = drafts ? latestByKind(drafts).threads : undefined;
  const stored = draft?.body ?? "";

  // Stored text wins unless the founder has unsaved changes of their own. An
  // edit that changed nothing (only an empty post added) or that now equals
  // the stored text follows Studio instead.
  const followStored =
    edit !== null && edit.base !== stored && (!threadChanged(edit.posts, edit.base) || !threadChanged(edit.posts, stored));
  if (followStored) setEdit(null);
  const live = followStored ? null : edit;

  const posts = live ? live.posts : postsOf(stored);
  const changed = threadChanged(posts, stored);
  const studioNewer = live !== null && live.base !== stored && changed;
  const checks = threadChecks(posts);

  const slotAt = draft && week ? Math.min(...week.filter((s) => s.draftId === draft._id).map((s) => s.scheduledAt), Infinity) : Infinity;
  // Right after queueing, trust this page until the board answers; a slot inside the
  // looked-at window that the board does not list has been cancelled.
  const local = draft && justQueued?.draftId === draft._id ? justQueued : null;
  const cancelled = local !== null && local.at !== null && local.at < from + QUEUE_DAYS * 86_400_000;
  const queuedAt: number | null | undefined = Number.isFinite(slotAt) ? slotAt : local && !cancelled ? local.at : undefined;
  const queued = queuedAt !== undefined;

  const onChange = useCallback(
    (next: string[]) => {
      setError(null);
      setEdit({ base: live ? live.base : stored, posts: next });
    },
    [live, stored]
  );

  /** Store the posts as the topic's thread; resolves to the draft id, or null when blocked or failed. */
  const persist = useCallback(async (): Promise<Id<"drafts"> | null> => {
    if (!checks.canSave) {
      setError(checks.saveReason);
      return null;
    }
    const body = threadBody(posts);
    setSaving(true);
    setError(null);
    try {
      // A queued draft is edited in place (a new one would not replace it); otherwise createManual replaces it.
      if (draft && queued) {
        await updateDraft({ id: draft._id, body });
        return draft._id;
      }
      return await createManual({ topicId, kind: "threads", body });
    } catch (err) {
      setError(refusalText(err, "Couldn't save this thread. Try again."));
      return null;
    } finally {
      setSaving(false);
    }
  }, [checks.canSave, checks.saveReason, posts, draft, queued, updateDraft, createManual, topicId]);

  const saveNow = useCallback(() => {
    if (busy.current || !changed) return;
    busy.current = true;
    void persist().finally(() => {
      busy.current = false;
    });
  }, [changed, persist]);

  const queue = useCallback(() => {
    if (busy.current || queued) return;
    if (!checks.canQueue) {
      setError(checks.queueReason);
      return;
    }
    busy.current = true;
    setQueuing(true);
    void (async () => {
      try {
        const id = changed || !draft ? await persist() : draft._id;
        if (!id) return;
        const res = await enqueue({ draftId: id, tz: browserTz });
        setJustQueued({ draftId: id, at: res.scheduledAt });
        toast({
          title: queuedForText(res.scheduledAt, tz),
          detail: "Your thread is in the queue.",
          actions: [{ label: "View queue", href: "/queue", variant: "primary" }],
        });
      } catch (err) {
        if (refusalCode(err) === "ALREADY_QUEUED" && draft) setJustQueued({ draftId: draft._id, at: null });
        setError(refusalText(err, "Couldn't queue this thread. Try again."));
      } finally {
        busy.current = false;
        setQueuing(false);
      }
    })();
  }, [queued, checks.canQueue, checks.queueReason, changed, draft, persist, enqueue, browserTz, toast, tz]);

  // Leaving the section (focus out, another topic, closing the tab) keeps unsaved text.
  const leave = useCallback(() => {
    if (changed && checks.canSave) saveNow();
  }, [changed, checks.canSave, saveNow]);
  const leaveRef = useRef(leave);
  useEffect(() => {
    leaveRef.current = leave;
  });
  useEffect(() => {
    const onHide = () => leaveRef.current();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      leaveRef.current();
    };
  }, []);

  const studioHref = studioTopicHref(topicId, "research");
  const openInStudio = useCallback(() => {
    if (!changed || !checks.canSave) {
      router.push(studioHref);
      return;
    }
    if (busy.current) return;
    busy.current = true;
    void persist()
      .then((id) => {
        if (id) router.push(studioHref);
      })
      .finally(() => {
        busy.current = false;
      });
  }, [changed, checks.canSave, persist, router, studioHref]);

  let status: TopicThread["status"] = "ready";
  let goneReason: TopicThread["goneReason"];
  if (topic === undefined || drafts === undefined || week === undefined) status = "loading";
  else if (topic === null || topic.archivedAt !== undefined) {
    status = "gone";
    goneReason = topic === null ? "deleted" : "archived";
  }

  return {
    status,
    goneReason,
    posts,
    onChange,
    hasThread: cleanThread(postsOf(stored)).length > 0,
    save: saveState({ hasDraft: Boolean(draft), changed, saving }),
    checks,
    saving,
    queuing,
    queuedLabel: queued ? (queuedAt === null ? "Queued" : queuedForText(queuedAt, tz)) : null,
    error,
    studioNewer,
    useStudioVersion: () => setEdit(null),
    saveNow,
    queue,
    leave,
    openInStudio,
    studioHref,
  };
}
