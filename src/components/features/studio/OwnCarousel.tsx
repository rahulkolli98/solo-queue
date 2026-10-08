"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { VERIFIED_TTL_MS } from "../../../../convex/lib/slots";
import CarouselCaption from "@/components/features/studio/CarouselCaption";
import { UploadIcon } from "@/components/ui/icons";
import { captionCount } from "@/lib/carouselEditor";
import {
  OWN_MAX_IMAGES,
  OWN_MIN_IMAGES,
  OwnUploadError,
  addFiles,
  imageNotes,
  moveItem,
  removeItem,
  uploadOwnImages,
  type ImageSize,
} from "@/lib/ownCarousel";
import { studioErrorText } from "@/lib/studioErrors";
import { useMediaUpload } from "@/lib/useMediaUpload";
import { useNow } from "@/lib/useNow";

const fileKey = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

/** Upload and check a list of files, resolving with their library ids in order. */
function useUploadImages() {
  const startUpload = useMediaUpload();
  const verify = useAction(api.media.verify);
  return useCallback(
    (files: File[], have: Map<string, string>, onProgress: (done: number, total: number) => void) =>
      uploadOwnImages({
        files,
        keyOf: fileKey,
        have,
        upload: async (f) => (await startUpload(f, () => undefined).done) as string,
        verify: (id) => verify({ id: id as Id<"mediaAssets"> }),
        onProgress,
        errorText: (e) => studioErrorText(e, "Try again."),
      }),
    [startUpload, verify]
  );
}

function Notes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="studio-own-notes" aria-label="About these images">
      {notes.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}

const RULES =
  "2 to 10 PNG or JPEG images, in the order they should swipe. Instagram crops every image to the shape of the first one; 1080 × 1350 (4:5) is the usual.";

/** The picker: choose files, put them in order, write the caption, and make the carousel. */
export function OwnCarouselStart({
  topicId,
  replacing,
  onDone,
  onCancel,
}: {
  topicId: string;
  /** The topic already has a written carousel, which this one replaces. */
  replacing: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const create = useMutation(api.drafts.createOwnCarousel);
  const uploadAll = useUploadImages();
  const inputId = useId();
  const captionId = useId();
  const picker = useRef<HTMLInputElement>(null);
  const have = useRef(new Map<string, string>());
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [sizes, setSizes] = useState<Record<string, ImageSize>>({});
  const [refused, setRefused] = useState<string[]>([]);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const count = captionCount(caption);
  const notes = imageNotes(files.map((f) => sizes[fileKey(f)]));
  const ready = files.length >= OWN_MIN_IMAGES && caption.trim().length > 0 && !count.over && busy === null;

  function add(list: FileList | File[] | null) {
    if (!list || busy) return;
    const out = addFiles(files, Array.from(list));
    setFiles(out.files);
    setRefused(out.refused);
    setError(null);
  }

  async function make() {
    if (!ready) return;
    setError(null);
    setBusy({ done: 0, total: files.length });
    try {
      const ids = await uploadAll(files, have.current, (done, total) => setBusy({ done, total }));
      await create({ topicId: topicId as Id<"topics">, caption, mediaAssetIds: ids as Id<"mediaAssets">[] });
      onDone();
    } catch (e) {
      setError(e instanceof OwnUploadError ? e.message : studioErrorText(e, "Couldn't make the carousel. Your images and caption are still here. Try again."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="studio-own">
      <div className="studio-cr-head">
        <span className="t-meta">YOUR OWN CAROUSEL</span>
        <button type="button" className="studio-linkbtn" onClick={onCancel} disabled={busy !== null}>
          Back
        </button>
      </div>
      {replacing && <p className="studio-cr-note">This replaces the carousel you have written for this topic.</p>}
      <div
        className="studio-own-drop"
        data-over={over || undefined}
        onDragOver={(e) => {
          if (busy) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
      >
        <UploadIcon />
        <div className="studio-upload-text">
          <b>{files.length === 0 ? "Choose your images" : `${files.length} of ${OWN_MAX_IMAGES} images`}</b>
          <span>{RULES}</span>
        </div>
        <button
          type="button"
          className="sq-btn sq-btn-sm sq-btn-dark"
          disabled={busy !== null || files.length >= OWN_MAX_IMAGES}
          onClick={() => picker.current?.click()}
        >
          {files.length === 0 ? "Choose images" : "Add more"}
        </button>
        <label htmlFor={inputId} className="sq-sr">
          Choose images for the carousel
        </label>
        <input
          id={inputId}
          ref={picker}
          type="file"
          multiple
          accept="image/png,image/jpeg"
          className="sq-sr"
          tabIndex={-1}
          disabled={busy !== null}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {refused.length > 0 && (
        <ul className="studio-own-notes" role="alert" aria-label="Files that were not added">
          {refused.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ol className="studio-own-list" aria-label="Your images, in order">
          {files.map((f, i) => (
            <li className="studio-own-item" key={fileKey(f)}>
              {/* A local preview of the chosen file; next/image cannot optimise a blob URL. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={urls[i]}
                alt={`Image ${i + 1}: ${f.name}`}
                onLoad={(e) => {
                  const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                  setSizes((s) => (s[fileKey(f)]?.w === w && s[fileKey(f)]?.h === h ? s : { ...s, [fileKey(f)]: { w, h } }));
                }}
              />
              <span className="studio-own-n" aria-hidden="true">
                {i + 1}
              </span>
              <div className="studio-own-tools">
                <button type="button" className="sq-btn sq-btn-sm studio-cr-btn" aria-label={`Move image ${i + 1} left`} disabled={busy !== null || i === 0} onClick={() => setFiles(moveItem(files, i, -1))}>
                  Left
                </button>
                <button type="button" className="sq-btn sq-btn-sm studio-cr-btn" aria-label={`Move image ${i + 1} right`} disabled={busy !== null || i === files.length - 1} onClick={() => setFiles(moveItem(files, i, 1))}>
                  Right
                </button>
                <button type="button" className="sq-btn sq-btn-sm studio-cr-btn" aria-label={`Remove image ${i + 1}`} disabled={busy !== null} onClick={() => setFiles(removeItem(files, i))}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <Notes notes={notes} />

      <div className="studio-cr-caption">
        <div className="studio-caption-head">
          <label htmlFor={captionId} className="studio-cr-label">
            Instagram caption
          </label>
          <span className="t-meta">CAPTION · {count.label}</span>
          {count.over && <span className="sq-pill sq-pill-bad">OVER BY {count.overBy}</span>}
        </div>
        <textarea
          id={captionId}
          className="sq-input studio-cr-caption-input"
          rows={5}
          value={caption}
          disabled={busy !== null}
          aria-invalid={count.over || undefined}
          placeholder="Write or paste the caption that goes with these images."
          onChange={(e) => setCaption(e.target.value)}
        />
      </div>

      {error && (
        <p className="studio-inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="studio-cr-statusbar">
        <p className="studio-cr-status" role="status" aria-live="polite">
          {busy
            ? `Uploading and checking your images: ${busy.done} of ${busy.total}…`
            : files.length < OWN_MIN_IMAGES
              ? `Add at least ${OWN_MIN_IMAGES} images.`
              : !caption.trim()
                ? "Write the caption to go with them."
                : count.over
                  ? "Shorten the caption first."
                  : `${files.length} images ready.`}
        </p>
        <div className="studio-actions-row">
          <button type="button" className="sq-btn sq-btn-sm sq-btn-dark studio-cr-btn" disabled={!ready} onClick={() => void make()}>
            {busy ? "Working…" : "Make the carousel"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A carousel made of the founder's own images: reorder, add, remove, edit the caption, check the files. */
export function OwnCarouselEditor({ draft, bannedWords }: { draft: Doc<"drafts">; bannedWords?: string[] }) {
  const ids = draft.mediaAssetIds ?? [];
  const assets = useQuery(api.media.byIds, ids.length > 0 ? { ids: ids.slice(0, OWN_MAX_IMAGES) } : "skip");
  const setImages = useMutation(api.drafts.setOwnCarouselImages);
  const verifyImage = useAction(api.media.verify);
  const uploadAll = useUploadImages();
  const now = useNow();
  const picker = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refused, setRefused] = useState<string[]>([]);
  const [sizes, setSizes] = useState<Record<string, ImageSize>>({});
  const [armed, setArmed] = useState<number | null>(null);

  useEffect(() => {
    if (armed === null) return;
    const timer = setTimeout(() => setArmed(null), 3000);
    return () => clearTimeout(timer);
  }, [armed]);

  const byId = new Map((assets ?? []).map((a) => [a._id as string, a]));
  const needsCheck = assets !== undefined && assets.some((a) => !a.verifiedAt || now - a.verifiedAt > VERIFIED_TTL_MS);
  const notes = imageNotes(ids.map((id) => sizes[id]));

  async function change(next: string[]) {
    setBusy("Saving…");
    setError(null);
    setArmed(null);
    try {
      await setImages({ id: draft._id, mediaAssetIds: next as Id<"mediaAssets">[] });
    } catch (e) {
      setError(studioErrorText(e, "Couldn't save the change. Try again."));
    } finally {
      setBusy(null);
    }
  }

  async function addMore(list: FileList | null) {
    if (!list || busy) return;
    const out = addFiles([] as File[], Array.from(list), OWN_MAX_IMAGES - ids.length);
    setRefused(out.refused);
    if (out.files.length === 0) return;
    setError(null);
    setBusy(`Uploading and checking: 0 of ${out.files.length}…`);
    try {
      const added = await uploadAll(out.files, new Map(), (done, total) => setBusy(`Uploading and checking: ${done} of ${total}…`));
      await change([...ids, ...added]);
    } catch (e) {
      setError(e instanceof OwnUploadError ? e.message : studioErrorText(e, "Couldn't add the images. Try again."));
      setBusy(null);
    }
  }

  async function checkImages() {
    setBusy("Checking the images…");
    setError(null);
    try {
      for (const id of ids) await verifyImage({ id });
    } catch (e) {
      setError(studioErrorText(e, "Couldn't check the images. Try again."));
    } finally {
      setBusy(null);
    }
  }

  let status: ReactNode;
  if (busy) status = busy;
  else if (needsCheck) status = `${ids.length} images attached. They need a check before the carousel can be queued.`;
  else status = `${ids.length} images attached and checked.`;

  return (
    <div className="studio-own">
      <div className="studio-cr-head">
        <span className="t-meta">YOUR OWN CAROUSEL · {ids.length} IMAGES</span>
      </div>
      <ol className="studio-own-list" aria-label="Your images, in order">
        {ids.map((id, i) => {
          const asset = byId.get(id);
          return (
            <li className="studio-own-item" key={id}>
              {asset?.publicUrl ? (
                // The image is on the founder's own storage URL, not something next/image can size ahead of time.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={asset.publicUrl}
                  alt={`Image ${i + 1}${asset.filename ? `: ${asset.filename}` : ""}`}
                  onLoad={(e) => {
                    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                    setSizes((s) => (s[id]?.w === w && s[id]?.h === h ? s : { ...s, [id]: { w, h } }));
                  }}
                />
              ) : (
                <span className="sq-sk studio-own-skeleton" aria-hidden="true" />
              )}
              <span className="studio-own-n" aria-hidden="true">
                {i + 1}
              </span>
              <div className="studio-own-tools">
                <button type="button" className="sq-btn sq-btn-sm studio-cr-btn" aria-label={`Move image ${i + 1} left`} disabled={busy !== null || i === 0} onClick={() => void change(moveItem(ids, i, -1))}>
                  Left
                </button>
                <button type="button" className="sq-btn sq-btn-sm studio-cr-btn" aria-label={`Move image ${i + 1} right`} disabled={busy !== null || i === ids.length - 1} onClick={() => void change(moveItem(ids, i, 1))}>
                  Right
                </button>
                <button
                  type="button"
                  className="sq-btn sq-btn-sm studio-cr-btn"
                  aria-label={armed === i ? `Tap again to remove image ${i + 1}` : `Remove image ${i + 1}`}
                  disabled={busy !== null || ids.length <= OWN_MIN_IMAGES}
                  title={ids.length <= OWN_MIN_IMAGES ? `A carousel needs at least ${OWN_MIN_IMAGES} images.` : undefined}
                  onClick={() => (armed === i ? void change(removeItem(ids, i)) : setArmed(i))}
                >
                  {armed === i ? "Tap again" : "Remove"}
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="studio-actions-row">
        <button type="button" className="sq-btn sq-btn-sm studio-cr-btn" disabled={busy !== null || ids.length >= OWN_MAX_IMAGES} onClick={() => picker.current?.click()}>
          Add images
        </button>
        <span className="t-meta">
          {ids.length} / {OWN_MAX_IMAGES} IMAGES · {OWN_MIN_IMAGES} TO {OWN_MAX_IMAGES} ALLOWED
        </span>
        <label htmlFor={inputId} className="sq-sr">
          Add images to the carousel
        </label>
        <input
          id={inputId}
          ref={picker}
          type="file"
          multiple
          accept="image/png,image/jpeg"
          className="sq-sr"
          tabIndex={-1}
          disabled={busy !== null}
          onChange={(e) => {
            void addMore(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {refused.length > 0 && (
        <ul className="studio-own-notes" role="alert" aria-label="Files that were not added">
          {refused.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <Notes notes={notes} />

      <CarouselCaption draft={draft} bannedWords={bannedWords} />

      <div className="studio-cr-statusbar">
        <p className="studio-cr-status" role="status" aria-live="polite">
          {status}
        </p>
        <p className="studio-cr-note">
          To have the slides written for you instead, tick Carousel in the setup line and Generate. That replaces this carousel; your image files stay in the library.
        </p>
        {error && (
          <p className="studio-inline-error" role="alert">
            {error}
          </p>
        )}
        {needsCheck && (
          <div className="studio-actions-row">
            <button type="button" className="sq-btn sq-btn-sm sq-btn-primary studio-cr-btn" disabled={busy !== null} onClick={() => void checkImages()}>
              {busy === "Checking the images…" ? "Checking…" : "Check the images"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
