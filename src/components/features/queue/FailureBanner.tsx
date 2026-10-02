"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import Banner from "@/components/ui/Banner";
import { useToast } from "@/components/ui/Toast";
import { errorText } from "@/lib/errors";
import { formatStamp } from "@/lib/queueBoard";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export interface Failure {
  slotId: string;
  title: string;
  reason: string;
}

/**
 * Failure first: pinned above the board whenever a post in the window failed.
 * Names the first failure with its reason, counts the rest, and offers the two
 * fixes: open the post (reschedule, replace media) or retry it straight away.
 */
export default function FailureBanner({
  failed,
  tz,
  onOpen,
}: {
  failed: Failure[];
  tz: string;
  onOpen: (id: string) => void;
}) {
  const retry = useMutation(api.queueBoard.retry);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const first = failed[0];
  if (!first) return null;
  const more = failed.length - 1;

  async function retryNow() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await retry({ id: first.slotId as Id<"slots">, tz });
      toast({ title: "Back in the queue", detail: formatStamp(r.scheduledAt, tz) });
    } catch (e) {
      toast({ title: "Could not retry", detail: errorText(e, "Try again from the post."), tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Banner
      tone="coral"
      title={first.title}
      detail={`${first.reason}${more > 0 ? ` ${more} more failed.` : ""}`}
      actions={[
        { label: "Retry now", onClick: retryNow },
        { label: "Open post", variant: "primary", onClick: () => onOpen(first.slotId) },
      ]}
    />
  );
}
