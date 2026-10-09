"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useToast } from "@/components/ui/Toast";
import { studioErrorText } from "@/lib/studioErrors";
import { KIND_META, weekToast, type Draft, type DraftKind } from "@/lib/studioModel";

/**
 * The one-gesture "queue this week": `slots.queueTopic` assigns each ready
 * draft to its next free slot; the result becomes the board's toast with
 * View queue / Attach media.
 */
export function useQueueWeek({
  topicId,
  tz,
  prepare,
  onAttachMedia,
}: {
  topicId: string;
  tz: string;
  /** Runs first: save pending edits so the server queues what is on screen. */
  prepare: () => Promise<void>;
  onAttachMedia: (kind: DraftKind | undefined) => void;
}) {
  const queueTopic = useMutation(api.slots.queueTopic);
  const { toast } = useToast();
  const [queuing, setQueuing] = useState(false);
  /** Draft id -> the time it was queued for, for this page session. */
  const [queuedAt, setQueuedAt] = useState<Record<string, number>>({});

  /** `kinds`: the drafts to queue (the founder's picks). Omitted: everything the topic has. */
  async function queue(latest: Partial<Record<DraftKind, Draft>>, kinds?: readonly DraftKind[]): Promise<void> {
    setQueuing(true);
    try {
      await prepare();
      const result = await queueTopic({
        topicId: topicId as Id<"topics">,
        tz,
        ...(kinds ? { templateKeys: kinds.map((k) => KIND_META[k].templateKey) } : {}),
      });
      const marks: Record<string, number> = {};
      for (const q of result.queued) {
        const kind = (Object.keys(KIND_META) as DraftKind[]).find((k) => KIND_META[k].templateKey === q.templateKey);
        const draft = kind ? latest[kind] : undefined;
        if (draft) marks[draft._id] = q.scheduledAt;
      }
      setQueuedAt((prev) => ({ ...prev, ...marks }));
      const t = weekToast(result);
      toast({
        title: t.title,
        detail: t.detail,
        tone: t.tone,
        actions: [
          { label: "View queue", href: "/queue", variant: "primary" },
          ...(t.needsMedia
            ? [{ label: "Attach media", onClick: () => onAttachMedia(t.mediaKind) }]
            : []),
        ],
      });
    } catch (e) {
      toast({ title: "Couldn't queue the week", detail: studioErrorText(e, "Try again."), tone: "bad" });
    } finally {
      setQueuing(false);
    }
  }

  return { queue, queuing, queuedAt };
}
