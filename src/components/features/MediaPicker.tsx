"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type Asset = FunctionReturnType<typeof api.media.list>[number];

const MAX_BYTES = 50 * 1024 * 1024;

function cleanError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  // Convex prefixes action errors with "[CONVEX A(...)] ... Uncaught Error: " —
  // show the human part.
  const m = err.message.match(/Uncaught Error: ([\s\S]*?) at \w+ \(/);
  if (m) return m[1].replace(/\s+Called by client\s*$/, "").trim();
  return err.message;
}

function fmtTime(ts: number): string {
  return new Date(ts)
    .toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
    .toUpperCase();
}

function AssetRow({ asset }: { asset: Asset }) {
  const verify = useAction(api.media.verify);
  const remove = useMutation(api.media.remove);
  const [verifying, setVerifying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isVideo = asset.mimeType.startsWith("video/");

  async function onVerify() {
    setVerifying(true);
    setError(null);
    try {
      await verify({ id: asset._id });
    } catch (err) {
      setError(cleanError(err, "Verification failed."));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="sq-card">
      <div className="sq-card-h">
        <span className="t-body-strong">
          {isVideo ? "Video" : "Image"} · {asset.mimeType}
        </span>
        <span className="sq-tag" style={{ marginLeft: "auto" }}>
          {asset.verifiedAt ? `VERIFIED ${fmtTime(asset.verifiedAt)}` : "UNVERIFIED"}
        </span>
      </div>
      {isVideo ? (
        <video
          src={asset.publicUrl}
          controls
          preload="metadata"
          style={{ width: "100%", maxWidth: 420, borderRadius: 8 }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset.publicUrl}
          alt="Library media"
          style={{ width: "100%", maxWidth: 420, borderRadius: 8 }}
        />
      )}
      <span className="t-meta" style={{ color: "var(--color-muted-on-surface)" }}>
        ADDED {fmtTime(asset.createdAt)}
        {asset.storageId.startsWith("external:") ? " · HOSTED URL" : " · UPLOADED"}
      </span>
      {error && (
        <div className="sq-error-box" role="alert">
          {error}
        </div>
      )}
      <div className="sq-row">
        <button
          className="sq-btn"
          style={{ height: 36, fontSize: 13 }}
          disabled={verifying}
          onClick={onVerify}
        >
          {verifying ? "Verifying…" : asset.verifiedAt ? "Re-verify" : "Verify URL"}
        </button>
        {!confirming ? (
          <button
            className="sq-btn"
            style={{ height: 36, fontSize: 13 }}
            onClick={() => setConfirming(true)}
          >
            Delete
          </button>
        ) : (
          <button
            className="sq-btn sq-btn-primary"
            style={{ height: 36, fontSize: 13 }}
            onClick={() => void remove({ id: asset._id })}
          >
            Confirm delete
          </button>
        )}
      </div>
    </div>
  );
}

export default function MediaPicker() {
  const assets = useQuery(api.media.list);
  const generateUploadUrl = useMutation(api.media.generateUploadUrl);
  const store = useMutation(api.media.store);
  const registerExternal = useMutation(api.media.registerExternal);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [extUrl, setExtUrl] = useState("");
  const [extKind, setExtKind] = useState<"image" | "video">("image");
  const [registering, setRegistering] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
        throw new Error("Only images and videos can be queued to Instagram.");
      }
      if (file.size > MAX_BYTES) {
        throw new Error("File is too big (50 MB max for Instagram-bound media).");
      }
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed — try again.");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await store({ storageId, mimeType: file.type });
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function onRegisterExternal() {
    if (!extUrl.trim()) {
      setUploadError("Paste a URL first.");
      return;
    }
    setRegistering(true);
    setUploadError(null);
    try {
      await registerExternal({
        url: extUrl.trim(),
        mimeType: extKind === "video" ? "video/mp4" : "image/jpeg",
      });
      setExtUrl("");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Couldn't register that URL.");
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <section className="sq-card" aria-label="Add media">
        <div className="sq-card-h">
          <h2 className="sq-card-title">Add media</h2>
        </div>
        <div className="sq-form-row">
          <label htmlFor="media-file">Upload a photo or video</label>
          <input
            id="media-file"
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
        </div>
        {uploading && (
          <p className="sq-muted" aria-live="polite" style={{ marginBottom: 0 }}>
            Uploading…
          </p>
        )}
        <div className="sq-form-row" style={{ marginTop: 8 }}>
          <label htmlFor="media-url">Or register a hosted URL</label>
          <input
            id="media-url"
            className="sq-field"
            style={{ width: "100%", maxWidth: 420 }}
            value={extUrl}
            onChange={(e) => setExtUrl(e.target.value)}
            inputMode="url"
            placeholder="https://…"
            maxLength={2000}
          />
        </div>
        <div className="sq-row" style={{ marginTop: 8 }}>
          <select
            className="sq-field"
            style={{ width: 160 }}
            value={extKind}
            onChange={(e) => setExtKind(e.target.value as "image" | "video")}
            aria-label="Hosted media kind"
          >
            <option value="image">Image URL</option>
            <option value="video">Video URL</option>
          </select>
          <button
            className="sq-btn"
            style={{ height: 36, fontSize: 13 }}
            disabled={registering}
            onClick={onRegisterExternal}
          >
            {registering ? "Adding…" : "Add URL"}
          </button>
        </div>
        {uploadError && (
          <div className="sq-error-box" role="alert" style={{ marginTop: 8 }}>
            {uploadError}
          </div>
        )}
      </section>

      {assets === undefined && <p className="sq-muted">Loading library…</p>}
      {assets !== undefined && assets.length === 0 && (
        <div className="sq-card">
          <p className="sq-muted" style={{ margin: 0 }}>
            Library is empty. Upload the photos and clips your IG drafts will
            need — every URL gets verified reachable before it can queue.
          </p>
        </div>
      )}
      {assets !== undefined &&
        assets.map((a) => <AssetRow key={a._id} asset={a} />)}
    </div>
  );
}
