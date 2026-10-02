"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import {
  checkUploadFile,
  dayMonth,
  matchesSearch,
  mediaName,
  mediaState,
  mimeFromUrl,
  tiltFor,
} from "@/lib/libraryBoard";
import { UploadCancelled } from "@/lib/mediaUpload";
import { refusalText } from "@/lib/refusalText";
import { useMediaUpload } from "@/lib/useMediaUpload";
import { useTwoTap } from "@/lib/useTwoTap";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import LibraryRail from "./LibraryRail";
import MediaThumb from "./MediaThumb";
import { PostcardSkeletons } from "./PublishedTab";
import type { Frame, LibraryFilters, MediaAsset } from "./types";

interface Uploading {
  id: number;
  name: string;
  percent: number;
  cancel: () => void;
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" />
    </svg>
  );
}

function UploadingTile({ item, index }: { item: Uploading; index: number }) {
  return (
    <article className="lb-tile" style={{ transform: `rotate(${tiltFor(index)}deg)` }}>
      <div className="lb-thumb">
        <div className="lb-meter" role="progressbar" aria-label={`Uploading ${item.name}`} aria-valuenow={item.percent} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${item.percent}%` }} />
        </div>
      </div>
      <span className="lb-pill lb-pill-mid">UPLOADING · {item.percent}%</span>
      <div className="lb-tile-row">
        <span className="t-meta lb-tile-name">{item.name}</span>
      </div>
      <div className="lb-actions">
        <button type="button" className="lb-act lb-act-dark" onClick={item.cancel}>
          Cancel
        </button>
      </div>
    </article>
  );
}

function MediaTile({
  asset,
  index,
  checking,
  tz,
  onVerify,
}: {
  asset: MediaAsset;
  index: number;
  checking: boolean;
  tz: string;
  onVerify: () => void;
}) {
  const remove = useMutation(api.media.remove);
  const { toast } = useToast();
  const del = useTwoTap();
  const state = mediaState(asset);
  const bad = state === "unreachable" && !checking;

  async function onRemove() {
    try {
      await remove({ id: asset._id });
      toast({ title: "File removed" });
    } catch (err) {
      toast({ title: "Could not remove it", detail: refusalText(err, "Try again."), tone: "bad" });
    }
  }

  return (
    <article className={`lb-tile${bad ? " lb-tile-bad" : ""}`} style={{ transform: `rotate(${tiltFor(index)}deg)` }}>
      <div className={`lb-thumb${bad ? " lb-thumb-bad" : ""}`}>
        {!bad && <MediaThumb asset={asset} />}
      </div>
      {checking ? (
        <span className="lb-pill lb-pill-mid">CHECKING…</span>
      ) : state === "verified" ? (
        <span className="lb-pill lb-pill-ok">VERIFIED · {dayMonth(asset.verifiedAt ?? asset.createdAt, tz)}</span>
      ) : state === "unreachable" ? (
        <span className="lb-pill lb-pill-bad" title={asset.lastVerifyError}>
          NOT REACHABLE
        </span>
      ) : (
        <span className="lb-pill lb-pill-mid">UNVERIFIED</span>
      )}
      <div className="lb-tile-row">
        <span className="t-meta lb-tile-name" title={mediaName(asset)}>
          {mediaName(asset)}
        </span>
        {asset.usedBy > 0 && <span className="t-meta">USED {asset.usedBy}×</span>}
      </div>
      <div className="lb-actions">
        <button type="button" className="lb-act lb-act-dark" disabled={checking} onClick={onVerify}>
          {state === "verified" ? "Re-check" : state === "unreachable" ? "Fix link" : "Verify"}
        </button>
        <button
          type="button"
          className="lb-act"
          aria-pressed={del.armed}
          onClick={() => del.tap(() => void onRemove())}
        >
          {del.armed ? "Tap again" : "Remove"}
        </button>
      </div>
    </article>
  );
}

/** Library › Media: upload (drop, browse, paste a URL), verification state and removal. */
export default function MediaTab({
  filters,
  tz,
  frames,
  voice,
  learnedFrom,
}: {
  filters: LibraryFilters;
  tz: string;
  frames: Frame[] | undefined;
  voice: string;
  learnedFrom: number;
}) {
  const assets = useQuery(api.media.list);
  const verify = useAction(api.media.verify);
  const registerExternal = useMutation(api.media.registerExternal);
  const startUpload = useMediaUpload();
  const { toast } = useToast();
  const picker = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const [over, setOver] = useState(false);
  const [uploads, setUploads] = useState<Uploading[]>([]);
  const [checking, setChecking] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function verifyAsset(id: Id<"mediaAssets">) {
    setChecking((c) => [...c, id]);
    try {
      await verify({ id });
    } catch (err) {
      setProblem(refusalText(err, "Could not check that file."));
    } finally {
      setChecking((c) => c.filter((x) => x !== id));
    }
  }

  async function uploadFiles(files: File[]) {
    setProblem(null);
    const refused: string[] = [];
    for (const file of files) {
      const why = checkUploadFile(file);
      if (why) {
        refused.push(why);
        continue;
      }
      const id = nextId.current++;
      const upload = startUpload(file, (percent) =>
        setUploads((list) => list.map((u) => (u.id === id ? { ...u, percent } : u)))
      );
      setUploads((list) => [...list, { id, name: file.name, percent: 0, cancel: upload.cancel }]);
      void upload.done
        .then((assetId) => verifyAsset(assetId))
        .catch((err: unknown) => {
          if (!(err instanceof UploadCancelled)) {
            setProblem(refusalText(err, `${file.name}: the upload failed. Try again.`));
          }
        })
        .finally(() => setUploads((list) => list.filter((u) => u.id !== id)));
    }
    if (refused.length > 0) setProblem(refused.join(" "));
  }

  async function addUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setProblem("Paste a public link to an image or video first.");
      return;
    }
    setAddingUrl(true);
    setProblem(null);
    try {
      const id = await registerExternal({ url, mimeType: mimeFromUrl(url.trim()) });
      setUrl("");
      toast({ title: "Link added", detail: "Checking that Meta can reach it." });
      await verifyAsset(id);
    } catch (err) {
      setProblem(refusalText(err, "Could not add that link."));
    } finally {
      setAddingUrl(false);
    }
  }

  const shown = (assets ?? []).filter((a) => matchesSearch([mediaName(a)], filters.search));
  const narrowed = Boolean(filters.search.trim());

  return (
    <div className="lb-grid">
      <div className="lb-main">
        <div
          className="lb-drop"
          data-over={over || undefined}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void uploadFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <UploadIcon />
          <div className="lb-drop-text">
            <b>Drop images or video</b>
            <span>JPG, PNG or MP4, up to 50 MB each</span>
          </div>
          <form className="lb-url" onSubmit={addUrl} noValidate>
            <label htmlFor="lb-url" className="sq-sr">
              External media URL
            </label>
            <input
              id="lb-url"
              type="url"
              inputMode="url"
              className="lb-search"
              placeholder="or paste a public URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button type="submit" className="sq-btn sq-btn-sm" disabled={addingUrl}>
              {addingUrl ? "Adding…" : "Add link"}
            </button>
          </form>
          <input
            ref={picker}
            type="file"
            accept="image/*,video/*"
            multiple
            className="sq-sr"
            tabIndex={-1}
            aria-label="Choose files to upload"
            onChange={(e) => {
              void uploadFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <button type="button" className="sq-btn sq-btn-sm sq-btn-dark" onClick={() => picker.current?.click()}>
            Browse
          </button>
        </div>
        <p className="lb-note" role="status" aria-live="polite" data-bad={problem ? true : undefined}>
          {problem ?? (uploads.length > 0 ? `Uploading ${uploads.length} ${uploads.length === 1 ? "file" : "files"}…` : "")}
        </p>
        <div className="lb-cards">
          {uploads.map((u, i) => (
            <UploadingTile key={u.id} item={u} index={i} />
          ))}
          {assets === undefined ? (
            <PostcardSkeletons />
          ) : shown.length === 0 && uploads.length === 0 ? (
            <div className="lb-empty">
              <b>{narrowed ? "Nothing matches" : "No media yet"}</b>
              <span>
                {narrowed
                  ? "Clear the search to see every file."
                  : "Drop the photos and clips your Instagram drafts will need. Each one is checked for a public link before it can queue."}
              </span>
            </div>
          ) : (
            shown.map((a, i) => (
              <MediaTile
                key={a._id}
                asset={a}
                index={i + uploads.length}
                checking={checking.includes(a._id)}
                tz={tz}
                onVerify={() => void verifyAsset(a._id)}
              />
            ))
          )}
        </div>
      </div>
      <LibraryRail frames={frames} voice={voice} learnedFrom={learnedFrom} />
    </div>
  );
}
