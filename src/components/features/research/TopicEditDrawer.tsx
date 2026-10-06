"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import Drawer from "@/components/ui/Drawer";
import FilterChip from "@/components/ui/FilterChip";
import FormField from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { refusalCode, refusalText } from "@/lib/refusalText";
import { useTwoTap } from "@/lib/useTwoTap";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { BoardTopic, Pillar } from "./types";
import { usePhone } from "./usePhone";

type Status = "drafting" | "ready" | "queued" | "done";

const STATUSES: { value: Status; label: string }[] = [
  { value: "drafting", label: "Drafting" },
  { value: "ready", label: "Ready" },
  { value: "queued", label: "Queued" },
  { value: "done", label: "Done" },
];

export const TITLE_ERROR = "Give it a title, even a rough one. Everything else is optional.";
/** The phone sheet (board MStatesResearchEdit) is short on room, so it drops the second sentence. */
export const TITLE_ERROR_PHONE = "Give it a title, even a rough one.";

/**
 * The edit panel (board 07i): a title (required), notes, source link, status
 * and pillar, with Save, Save & open in Studio, Archive and a two-tap Delete.
 * Mount it to open it; the form starts fresh each time. With no `topic` it
 * creates a new one.
 */
export default function TopicEditDrawer({
  topic,
  pillars,
  onClose,
  onSaved,
  onGone,
}: {
  topic: BoardTopic | null;
  pillars: Pillar[];
  onClose: () => void;
  /** The topic was saved (or created); `openStudio` asks the screen to go to /studio/<id>. */
  onSaved: (id: Id<"topics">, openStudio: boolean) => void;
  /** The topic was deleted or archived and is no longer on the board. */
  onGone: () => void;
}) {
  const create = useMutation(api.topics.create);
  const update = useMutation(api.topics.update);
  const archive = useMutation(api.topics.archive);
  const unarchive = useMutation(api.topics.unarchive);
  const remove = useMutation(api.topics.remove);
  const { toast } = useToast();
  const del = useTwoTap();

  const [title, setTitle] = useState(topic?.title ?? "");
  const [notes, setNotes] = useState(topic?.notes ?? "");
  const [sourceUrl, setSourceUrl] = useState(topic?.sourceUrl ?? "");
  const [status, setStatus] = useState<Status>(topic?.status ?? "drafting");
  const [pillar, setPillar] = useState(topic?.pillar ?? "");
  const phone = usePhone();
  const [titleMissing, setTitleMissing] = useState(false);
  const titleError = titleMissing ? (phone ? TITLE_ERROR_PHONE : TITLE_ERROR) : null;
  const [failure, setFailure] = useState<{ text: string; offerArchive: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(openStudio: boolean) {
    if (!title.trim()) {
      setTitleMissing(true);
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      let id: Id<"topics">;
      if (topic) {
        id = topic._id;
        await update({ id, title, notes, sourceUrl, pillar, status });
      } else {
        id = await create({ title, notes, sourceUrl, pillar });
        if (status !== "drafting") await update({ id, status });
      }
      toast({ title: topic ? "Topic saved" : "Topic added" });
      onSaved(id, openStudio);
    } catch (err) {
      setFailure({ text: refusalText(err, "Could not save the topic. Try again."), offerArchive: false });
    } finally {
      setBusy(false);
    }
  }

  async function doArchive() {
    if (!topic) return;
    setBusy(true);
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
      onGone();
    } catch (err) {
      setFailure({ text: refusalText(err, "Could not archive the topic. Try again."), offerArchive: false });
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!topic) return;
    setBusy(true);
    setFailure(null);
    try {
      await remove({ id: topic._id });
      toast({ title: "Topic deleted" });
      onGone();
    } catch (err) {
      setFailure({
        text: refusalText(err, "Could not delete the topic. Try again."),
        offerArchive: refusalCode(err) === "HAS_SLOTS",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      width="edit"
      title={topic ? "Edit topic" : "New topic"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="sq-btn sq-btn-dark rs-drawer-save" disabled={busy} onClick={() => void save(false)}>
            {busy ? "Saving…" : "Save topic"}
          </button>
          <button type="button" className="sq-btn rs-drawer-studio" disabled={busy} onClick={() => void save(true)}>
            Save &amp; open in Studio
          </button>
          {topic && (
            <>
              <span className="rs-drawer-spacer" />
              <button
                type="button"
                className="sq-btn rs-danger rs-drawer-delete"
                data-armed={del.armed || undefined}
                disabled={busy}
                onClick={() => del.tap(() => void doDelete())}
              >
                {del.armed ? "Tap again to delete" : "Delete"}
              </button>
            </>
          )}
        </>
      }
    >
      <FormField label="Title" error={titleError}>
        <input
          type="text"
          placeholder="What's this about?"
          value={title}
          maxLength={200}
          onChange={(e) => {
            setTitle(e.target.value);
            if (titleMissing) setTitleMissing(false);
          }}
        />
      </FormField>
      <FormField label="Notes">
        <textarea rows={3} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
      </FormField>
      <div className="rs-form-pair">
        <FormField label="Source link">
          <input type="url" inputMode="url" value={sourceUrl} maxLength={500} onChange={(e) => setSourceUrl(e.target.value)} />
        </FormField>
        <FormField label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <div className="rs-pillar-group" role="group" aria-label="Pillar">
        <span aria-hidden="true">Pillar</span>
        <div className="rs-pillar-chips">
          {pillars.map((p) => (
            <FilterChip
              key={p.key}
              pressed={pillar === p.key}
              swatch={p.color}
              onClick={() => setPillar(pillar === p.key ? "" : p.key)}
            >
              {p.name}
            </FilterChip>
          ))}
        </div>
      </div>
      {topic && (
        <button type="button" className="sq-btn sq-btn-sm rs-self-start" disabled={busy} onClick={() => void doArchive()}>
          Archive instead of deleting
        </button>
      )}
      {failure && (
        <div className="sq-error-box" role="alert">
          {failure.text}
          {failure.offerArchive && (
            <>
              {" "}
              <button type="button" className="sq-btn sq-btn-sm sq-btn-dark" disabled={busy} onClick={() => void doArchive()}>
                Archive it
              </button>
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}
