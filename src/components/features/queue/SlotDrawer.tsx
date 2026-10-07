"use client";

import { useQuery } from "convex/react";
import Drawer from "@/components/ui/Drawer";
import Skeleton from "@/components/ui/Skeleton";
import { PLATFORM_NAME, formatStamp } from "@/lib/queueBoard";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import SlotActions from "./SlotActions";
import SlotDetailBody, { type SlotDetail } from "./SlotDetailBody";
import { useSlotActions } from "./useSlotActions";

function Loaded({ detail, tz, onClose }: { detail: SlotDetail; tz: string; onClose: () => void }) {
  const { slot } = detail;
  const actions = useSlotActions({ id: slot._id as Id<"slots">, status: slot.status, scheduledAt: slot.scheduledAt, tz, onClose });
  const slides = detail.draft?.slideCount;
  const format = detail.draft?.format
    ? ` · ${detail.draft.format}${detail.draft.format === "carousel" && slides ? ` · ${slides} ${slides === 1 ? "slide" : "slides"}` : ""}`
    : "";
  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow={`${PLATFORM_NAME[slot.platform]}${format} · ${formatStamp(slot.scheduledAt, tz)}`}
      title={detail.topic?.title ?? "(deleted topic)"}
      footer={<SlotActions detail={detail} actions={actions} />}
    >
      <SlotDetailBody detail={detail} tz={tz} actions={actions} />
    </Drawer>
  );
}

function Pending({ id, tz, onClose }: { id: string; tz: string; onClose: () => void }) {
  const detail = useQuery(api.queueBoard.detail, { id: id as Id<"slots"> });
  if (detail === undefined) {
    return (
      <Drawer open onClose={onClose} eyebrow="Scheduled post" title="Loading post…">
        <div aria-busy="true" className="sq-q-d-loading">
          <Skeleton h={22} w="60%" />
          <Skeleton h={120} />
          <Skeleton h={14} />
          <Skeleton h={14} w="80%" />
        </div>
      </Drawer>
    );
  }
  if (detail === null) {
    return (
      <Drawer open onClose={onClose} eyebrow="Scheduled post" title="Post not found">
        <p className="sq-muted">It may have been cancelled or removed. The queue behind this panel is up to date.</p>
      </Drawer>
    );
  }
  return <Loaded detail={detail} tz={tz} onClose={onClose} />;
}

/**
 * The slot drawer (side panel on desktop, bottom sheet on phones): the post,
 * its media, every publish attempt and the actions that fit its status.
 * `slotId` comes from the URL (?slot=), so a link from Today opens it.
 */
export default function SlotDrawer({ slotId, tz, onClose }: { slotId: string | null; tz: string; onClose: () => void }) {
  if (!slotId) return null;
  return <Pending key={slotId} id={slotId} tz={tz} onClose={onClose} />;
}
