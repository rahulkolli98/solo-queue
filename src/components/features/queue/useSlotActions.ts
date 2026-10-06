"use client";

import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { errorText } from "@/lib/errors";
import { CANCEL_ARM_MS } from "@/lib/queueA11y";
import { formatStamp, fromInputValue, toInputValue } from "@/lib/queueBoard";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type Busy = "retry" | "reschedule" | "cancel" | "requeue" | null;

/**
 * The slot drawer's actions: retry a failed post, reschedule (a failed post is
 * re-queued at the new time), two-tap cancel, requeue a published one. Errors
 * come back as plain text for an inline alert; successes as toasts.
 */
export function useSlotActions({
  id,
  status,
  scheduledAt,
  tz,
  onClose,
}: {
  id: Id<"slots">;
  status: string;
  scheduledAt: number;
  tz: string;
  onClose: () => void;
}) {
  const retryMut = useMutation(api.queueBoard.retry);
  const requeueMut = useMutation(api.queueBoard.requeue);
  const rescheduleMut = useMutation(api.slots.reschedule);
  const cancelMut = useMutation(api.slots.cancel);
  const { toast } = useToast();
  const [typed, setTyped] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);

  // The field shows the slot's own time until the founder types.
  const when = typed ?? toInputValue(scheduledAt, tz);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), CANCEL_ARM_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  async function run(kind: Exclude<Busy, null>, work: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(errorText(e, "That did not go through. Try again."));
      setArmed(false);
    } finally {
      setBusy(null);
    }
  }

  return {
    when,
    setWhen: setTyped,
    busy,
    error,
    armed,
    retry: () =>
      run("retry", async () => {
        const r = await retryMut({ id, tz });
        toast({ title: "Back in the queue", detail: formatStamp(r.scheduledAt, tz) });
      }),
    reschedule: () =>
      run("reschedule", async () => {
        const at = fromInputValue(when, tz);
        if (at === null) throw new Error("Pick a date and a time.");
        const r =
          status === "failed" ? await retryMut({ id, scheduledAt: at, tz }) : await rescheduleMut({ id, scheduledAt: at, tz });
        toast({ title: "Moved", detail: formatStamp(r.scheduledAt, tz) });
        setTyped(null);
      }),
    requeue: () =>
      run("requeue", async () => {
        const r = await requeueMut({ id, tz });
        toast({ title: "Requeued", detail: formatStamp(r.scheduledAt, tz) });
        onClose();
      }),
    cancel: () => {
      if (!armed) {
        setArmed(true);
        return Promise.resolve();
      }
      return run("cancel", async () => {
        await cancelMut({ id });
        toast({ title: "Post cancelled", detail: "The draft is kept." });
        onClose();
      });
    },
  };
}
