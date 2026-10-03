"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import Drawer from "@/components/ui/Drawer";
import { useToast } from "@/components/ui/Toast";
import { mediaName, mediaState } from "@/lib/libraryBoard";
import { refusalText } from "@/lib/refusalText";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { checkEditedBody, splitPosts } from "../../../../convex/lib/drafting";
import MediaThumb from "./MediaThumb";
import type { DraftCard } from "./types";

const LIMIT_THREADS = 500;
const LIMIT_CAPTION = 2200;

function TrimForm({ draft, onClose }: { draft: Doc<"drafts">; onClose: () => void }) {
  const update = useMutation(api.drafts.update);
  const { toast } = useToast();
  const [body, setBody] = useState(draft.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isThreads = draft.platform === "threads";
  const limit = isThreads ? LIMIT_THREADS : LIMIT_CAPTION;
  const posts = isThreads ? splitPosts(body) : [body.trim()];
  const check = checkEditedBody(draft.platform, draft.templateKey, body);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await update({ id: draft._id, body });
      toast({
        title: check.constraintOk ? "Trimmed. It fits now." : "Draft saved",
        detail: check.constraintOk ? undefined : "It is still over the limit.",
        tone: check.constraintOk ? "ok" : "bad",
      });
      onClose();
    } catch (err) {
      setError(refusalText(err, "Could not save the draft. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label className="sq-formfield-label" htmlFor="lb-trim">
        {isThreads ? "Thread (split posts with a line of ---)" : "Caption"}
      </label>
      <textarea
        id="lb-trim"
        className="sq-input lb-trim"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <ul className="lb-counts" aria-live="polite">
        {posts.map((p, i) => (
          <li key={i} className="t-mono" data-over={p.length > limit || undefined}>
            {isThreads ? `Post ${i + 1}` : "Caption"}: {p.length} / {limit}
            {p.length > limit ? ` · ${p.length - limit} over` : ""}
          </li>
        ))}
      </ul>
      {error && (
        <p className="sq-error-box" role="alert">
          {error}
        </p>
      )}
      <div className="sq-drawer-footer">
        <button type="button" className="sq-btn sq-btn-dark" disabled={busy || !body.trim()} onClick={() => void save()}>
          {busy ? "Saving…" : "Save trim"}
        </button>
        <Link href={`/studio/${draft.topicId}`} className="sq-btn">
          Open in Studio
        </Link>
      </div>
    </>
  );
}

/** Over limit: edit the draft right here with a live count per post. */
export function TrimDrawer({ card, onClose }: { card: DraftCard; onClose: () => void }) {
  const drafts = useQuery(api.drafts.listByTopic, { topicId: card.topicId });
  const draft = drafts?.find((d) => d._id === card.draftId);
  return (
    <Drawer open title="Trim to fit" eyebrow={card.topicTitle} onClose={onClose}>
      {drafts === undefined ? (
        <p className="lb-note">Loading the draft…</p>
      ) : draft ? (
        <TrimForm draft={draft} onClose={onClose} />
      ) : (
        <p className="lb-note" data-bad="true">
          That draft is gone. It may have been replaced in Studio.
        </p>
      )}
    </Drawer>
  );
}

/** Needs media: pick a file from the library to attach to the draft. */
export function AttachDrawer({ card, onClose }: { card: DraftCard; onClose: () => void }) {
  const media = useQuery(api.media.list);
  const attach = useMutation(api.drafts.attachMedia);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function pick(id: Doc<"mediaAssets">["_id"]) {
    setBusy(true);
    try {
      await attach({ id: card.draftId, mediaAssetId: id });
      toast({ title: "Media attached", detail: "The draft can be queued now." });
      onClose();
    } catch (err) {
      toast({ title: "Could not attach that", detail: refusalText(err, "Try again."), tone: "bad" });
      setBusy(false);
    }
  }

  return (
    <Drawer open title="Attach media" eyebrow={card.topicTitle} onClose={onClose}>
      {media === undefined ? (
        <p className="lb-note">Loading the library…</p>
      ) : media.length === 0 ? (
        <div className="lb-empty">
          <b>No media yet</b>
          <span>Upload an image or video first. Instagram needs one before this draft can queue.</span>
          <Link href="/library/media" className="sq-btn sq-btn-dark">
            Go to Media
          </Link>
        </div>
      ) : (
        <div className="lb-picks">
          {media.map((m) => {
            const state = mediaState(m);
            return (
              <button key={m._id} type="button" className="lb-pick" disabled={busy} onClick={() => void pick(m._id)}>
                <span className="lb-thumb">
                  <MediaThumb asset={m} />
                </span>
                <span className="t-mono lb-tile-name">{mediaName(m)}</span>
                <span
                  className={`lb-pill ${state === "verified" ? "lb-pill-ok" : state === "unreachable" ? "lb-pill-bad" : "lb-pill-mid"}`}
                >
                  {state === "verified" ? "VERIFIED" : state === "unreachable" ? "NOT REACHABLE" : "UNVERIFIED"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Drawer>
  );
}
