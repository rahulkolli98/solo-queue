"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useId, useRef, useState } from "react";
import { UploadIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import {
  DESIGN_MAX,
  LAYOUT_LABELS,
  NAME_MAX,
  PLAN_MAX,
  PLAN_MIN,
  PLAN_TONES,
  REFERENCES_MAX,
  TONE_LABELS,
  addPlanSlide,
  addReferences,
  canAddPlanSlide,
  canMovePlanSlide,
  canRemovePlanSlide,
  designCount,
  designExcerpt,
  designFileProblem,
  designLength,
  designTextProblem,
  draftFromLook,
  emptyDraft,
  layoutChoices,
  lookProblems,
  lookSaveArgs,
  movePlanSlide,
  partsSummary,
  pickReferenceFiles,
  removePlan,
  removePlanSlide,
  removeReference,
  setPlanLayout,
  setPlanTone,
  startPlan,
  type LookDraft,
  type LookLike,
} from "@/lib/looksEditor";
import { UploadCancelled } from "@/lib/mediaUpload";
import { refusalText } from "@/lib/refusalText";
import { useMediaUpload } from "@/lib/useMediaUpload";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { PlanLayout } from "../../../../convex/lib/looks";
import type { SlideTone } from "../../../../convex/lib/carouselSlides";
import { THEMES, themeOf } from "../../../../convex/lib/themes";

const NEW_ID = "lk-new";
const editId = (key: string) => `lk-edit-${key}`;

/** What the section needs from a saved look (a row of api.looks.list). */
type LookRow = LookLike & { _id: string };

/**
 * Library › Carousel looks: the saved carousel designs the founder picks when writing a carousel. Each card shows
 * which parts a look has; New look and Edit open the editor below the list.
 */
export default function LooksSection() {
  const looks: LookRow[] | undefined = useQuery(api.looks.list);
  const remove = useMutation(api.looks.remove);
  const [editing, setEditing] = useState<{ id: string; draft: LookDraft } | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  function close(returnTo: string) {
    setEditing(null);
    setTimeout(() => document.getElementById(returnTo)?.focus(), 0);
  }

  async function onDelete(look: LookRow) {
    setDeleting(look.key);
    setError(null);
    try {
      await remove({ key: look.key });
      setArmed(null);
      if (editing?.draft.key === look.key) setEditing(null);
      setTimeout(() => document.getElementById(NEW_ID)?.focus(), 0);
    } catch (err) {
      setError(refusalText(err, "Could not delete the look. Try again."));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="lk" aria-labelledby={titleId}>
      <div className="lk-head">
        <div className="lk-head-text">
          <h2 className="lk-title" id={titleId}>
            Carousel looks
          </h2>
          <p className="lk-lead">
            A look is a saved carousel design: a theme, a slide plan, a design document, reference images, or any mix. Pick one when you
            write a carousel.
          </p>
        </div>
        <button
          type="button"
          id={NEW_ID}
          className="sq-btn sq-btn-dark lk-new"
          aria-expanded={editing !== null && editing.draft.key === null}
          aria-controls="lk-editor"
          onClick={() => {
            setArmed(null);
            setEditing({ id: `new-${Date.now()}`, draft: emptyDraft() });
          }}
        >
          New look
        </button>
      </div>

      {error && (
        <p className="sq-error-box" role="alert">
          {error}
        </p>
      )}

      {looks === undefined ? (
        <p className="lb-note" role="status">
          Loading your looks…
        </p>
      ) : looks.length === 0 ? (
        <div className="lk-empty">
          <b>No looks yet</b>
          <span>
            Press New look to save a design you like: a theme, the layout and colour of each slide, a few words on how it should read, or
            pictures of carousels you admire.
          </span>
        </div>
      ) : (
        <ul className="lk-list" aria-label="Your carousel looks">
          {looks.map((look) => (
            <li key={look._id} className="lk-card" data-editing={editing?.draft.key === look.key || undefined}>
              <LookCard
                look={look}
                armed={armed === look.key}
                busy={deleting === look.key}
                onEdit={() => {
                  setArmed(null);
                  setEditing({ id: `${look.key}-${Date.now()}`, draft: draftFromLook(look) });
                }}
                onArm={() => setArmed(look.key)}
                onDisarm={() => setArmed(null)}
                onDelete={() => void onDelete(look)}
              />
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <LookEditor
          key={editing.id}
          initial={editing.draft}
          usedCount={looks?.find((l) => l.key === editing.draft.key)?.usedCount ?? 0}
          onCancel={() => close(editing.draft.key === null ? NEW_ID : editId(editing.draft.key))}
          onSaved={(key) => close(editId(key))}
        />
      )}
    </section>
  );
}

function LookCard({
  look,
  armed,
  busy,
  onEdit,
  onArm,
  onDisarm,
  onDelete,
}: {
  look: LookRow;
  armed: boolean;
  busy: boolean;
  onEdit: () => void;
  onArm: () => void;
  onDisarm: () => void;
  onDelete: () => void;
}) {
  const excerpt = look.design ? designExcerpt(look.design) : "";
  return (
    <>
      <h3 className="lk-card-name">{look.name}</h3>
      <ul className="lk-chips" aria-label={`What ${look.name} holds`}>
        {partsSummary(look).map((chip) => (
          <li key={chip} className="lk-chip">
            {chip}
          </li>
        ))}
      </ul>
      {look.plan && look.plan.length > 0 && (
        <span
          className="lk-strip"
          role="img"
          aria-label={`Slide plan: ${look.plan.map((s) => `${LAYOUT_LABELS[s.layout]} ${TONE_LABELS[s.tone]}`).join(", ")}`}
        >
          {look.plan.map((s, i) => (
            <i key={i} className="lk-strip-slide" data-tone={s.tone} data-layout={s.layout} />
          ))}
        </span>
      )}
      {excerpt && <p className="lk-excerpt">{excerpt}</p>}
      <div className="lk-card-actions">
        {armed ? (
          <>
            <p className="lk-confirm" role="alert">
              Delete this look? Its reference images stay in your library.
            </p>
            <button type="button" className="sq-btn sq-btn-sm lk-danger" disabled={busy} aria-label={`Delete look ${look.name}`} onClick={onDelete}>
              {busy ? "Deleting…" : "Yes, delete"}
            </button>
            <button type="button" className="sq-btn sq-btn-sm" disabled={busy} onClick={onDisarm}>
              Keep it
            </button>
          </>
        ) : (
          <>
            <button type="button" id={editId(look.key)} className="sq-btn sq-btn-sm sq-btn-dark" aria-label={`Edit look ${look.name}`} onClick={onEdit}>
              Edit
            </button>
            <button type="button" className="sq-btn sq-btn-sm" aria-label={`Delete look ${look.name}`} onClick={onArm}>
              Delete
            </button>
          </>
        )}
      </div>
    </>
  );
}

interface Upload {
  uid: number;
  name: string;
  percent: number;
}

/** The editor panel: name, slide plan, design document, reference images, Save and Cancel. */
export function LookEditor({
  initial,
  usedCount,
  onSaved,
  onCancel,
}: {
  initial: LookDraft;
  usedCount: number;
  onSaved: (key: string) => void;
  onCancel: () => void;
}) {
  const save = useMutation(api.looks.save);
  const startUpload = useMediaUpload();
  const { toast } = useToast();
  const uid = useId();
  const [draft, setDraft] = useState<LookDraft>(initial);
  const [attempted, setAttempted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [designRefused, setDesignRefused] = useState<string | null>(null);
  const [refused, setRefused] = useState<string[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [over, setOver] = useState(false);
  const [focus, setFocus] = useState<{ id: string } | null>(null);
  const root = useRef<HTMLElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const designPicker = useRef<HTMLInputElement>(null);
  const imagePicker = useRef<HTMLInputElement>(null);
  const cancels = useRef(new Map<number, () => void>());
  const blobUrls = useRef<string[]>([]);
  const nextUpload = useRef(1);

  const isNew = draft.key === null;
  const assets = useQuery(
    api.media.byIds,
    draft.referenceIds.length > 0 ? { ids: draft.referenceIds.slice(0, REFERENCES_MAX) as Id<"mediaAssets">[] } : "skip"
  );
  const assetById = new Map((assets ?? []).map((a) => [a._id as string, a]));
  const problems = lookProblems(draft);
  const designUsed = designLength(draft.design);
  const imageRoom = REFERENCES_MAX - draft.referenceIds.length - uploads.length;
  const nameProblem = attempted && !draft.name.trim() ? true : undefined;

  // Opening the editor moves focus to the name and brings the panel into view.
  useEffect(() => {
    nameInput.current?.focus({ preventScroll: true });
    root.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, []);

  // Moving focus after an edit that removes or moves the control that had it.
  useEffect(() => {
    if (focus) document.getElementById(focus.id)?.focus();
  }, [focus]);

  // Leaving the editor stops uploads in flight and frees the local previews.
  useEffect(() => {
    const running = cancels.current;
    const urls = blobUrls.current;
    return () => {
      running.forEach((cancel) => cancel());
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const slideId = (i: number, part: string) => `${uid}-slide-${i}-${part}`;

  function change(next: LookDraft, focusId?: string) {
    setDraft(next);
    setServerError(null);
    if (focusId) setFocus({ id: focusId });
  }

  function onMove(i: number, direction: -1 | 1) {
    const next = movePlanSlide(draft, i, direction);
    const to = i + direction;
    const part = direction === -1 ? "up" : "down";
    // Keep focus on the same arrow unless the slide has reached the end of the middle, then on the other one.
    change(next, slideId(to, canMovePlanSlide(next, to, direction) ? part : direction === -1 ? "down" : "up"));
  }

  async function readDesignFile(file: File | undefined) {
    if (!file) return;
    setDesignRefused(null);
    const before = designFileProblem(file);
    if (before) return setDesignRefused(before);
    let text: string;
    try {
      text = await file.text();
    } catch {
      return setDesignRefused(`${file.name}: could not read that file.`);
    }
    const after = designTextProblem(file.name, text);
    if (after) return setDesignRefused(after);
    setDraft((d) => ({ ...d, design: text.replace(/\r\n?/g, "\n").trim() }));
    setServerError(null);
  }

  function startOne(file: File) {
    const id = nextUpload.current++;
    const handle = startUpload(file, (percent) => setUploads((u) => u.map((x) => (x.uid === id ? { ...x, percent } : x))));
    cancels.current.set(id, handle.cancel);
    setUploads((u) => [...u, { uid: id, name: file.name, percent: 0 }]);
    handle.done
      .then((mediaId) => {
        const url = URL.createObjectURL(file);
        blobUrls.current.push(url);
        setPreviews((p) => ({ ...p, [mediaId]: url }));
        setDraft((d) => addReferences(d, [mediaId]));
      })
      .catch((err: unknown) => {
        if (err instanceof UploadCancelled) return;
        setRefused((r) => [...r, `${file.name}: ${refusalText(err, "could not be uploaded. Try again.")}`]);
      })
      .finally(() => {
        cancels.current.delete(id);
        setUploads((u) => u.filter((x) => x.uid !== id));
      });
  }

  function addImages(list: FileList | File[] | null) {
    if (!list || busy) return;
    const picked = pickReferenceFiles(Array.from(list), imageRoom);
    setRefused(picked.refused);
    setServerError(null);
    picked.accepted.forEach(startOne);
  }

  function cancelUpload(id: number) {
    cancels.current.get(id)?.();
  }

  async function onSave() {
    setAttempted(true);
    if (problems.length > 0 || uploads.length > 0) return;
    setBusy(true);
    setServerError(null);
    try {
      const { referenceIds, ...args } = lookSaveArgs(draft);
      const res = await save({ ...args, ...(referenceIds ? { referenceIds: referenceIds as Id<"mediaAssets">[] } : {}) });
      toast({ title: res.created ? "Look created" : "Look saved" });
      onSaved(res.key);
    } catch (err) {
      setServerError(refusalText(err, "Could not save the look. Try again."));
      setBusy(false);
    }
  }

  const plan = draft.plan;
  const errorId = `${uid}-problems`;

  return (
    <section className="lk-editor" id="lk-editor" ref={root} aria-label={isNew ? "New look" : "Edit look"}>
      <div className="lk-editor-head">
        <h3 className="t-eyebrow">{isNew ? "New look" : "Edit look"}</h3>
        {!isNew && <span className="t-meta">USED {usedCount}×</span>}
      </div>

      <div className="lk-field">
        <label className="sq-formfield-label" htmlFor={`${uid}-name`}>
          Name
        </label>
        <input
          ref={nameInput}
          id={`${uid}-name`}
          type="text"
          className={`sq-input${nameProblem ? " sq-input-error" : ""}`}
          value={draft.name}
          maxLength={NAME_MAX}
          aria-invalid={nameProblem}
          aria-describedby={attempted && problems.length > 0 ? errorId : undefined}
          placeholder="Calm explainer"
          onChange={(e) => change({ ...draft, name: e.target.value })}
        />
      </div>

      <div className="lk-part">
        <div className="lk-part-head">
          <label className="lk-part-title" htmlFor={`${uid}-theme`}>
            Design
          </label>
        </div>
        <select
          id={`${uid}-theme`}
          className="sq-input lk-select lk-theme"
          value={draft.theme}
          aria-describedby={`${uid}-theme-hint`}
          onChange={(e) => change({ ...draft, theme: e.target.value })}
        >
          <option value="">No theme (the run decides)</option>
          {THEMES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </select>
        <p className="lk-hint" id={`${uid}-theme-hint`}>
          {draft.theme
            ? THEMES.find((t) => t.key === themeOf(draft.theme))?.blurb
            : "A theme is how every slide is drawn: colours, fonts and shapes. Leave it out and the run picks one, Solo Queue by default."}
        </p>
      </div>

      <div className="lk-part" role="group" aria-labelledby={`${uid}-plan-title`}>
        <div className="lk-part-head">
          <span className="lk-part-title" id={`${uid}-plan-title`}>
            Slide plan
          </span>
          {plan && (
            <span className="t-meta">
              {plan.length} OF {PLAN_MIN} TO {PLAN_MAX} SLIDES
            </span>
          )}
        </div>
        <p className="lk-hint">The layout and colour of each slide, in order. The slide count still comes from the Slides setting; the plan is stretched or squeezed to fit.</p>
        {plan ? (
          <>
            <ol className="lk-plan" aria-label="Slides in the plan">
              {plan.map((slide, i) => (
                <li className="lk-slide" key={i}>
                  <span className="lk-slide-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="lk-swatch" data-tone={slide.tone} aria-hidden="true" />
                  <select
                    id={slideId(i, "layout")}
                    className="sq-input lk-select"
                    aria-label={`Slide ${i + 1} layout`}
                    value={slide.layout}
                    disabled={layoutChoices(i, plan.length).length === 1}
                    onChange={(e) => change(setPlanLayout(draft, i, e.target.value as PlanLayout))}
                  >
                    {layoutChoices(i, plan.length).map((layout) => (
                      <option key={layout} value={layout}>
                        {LAYOUT_LABELS[layout]}
                      </option>
                    ))}
                  </select>
                  <select
                    id={slideId(i, "tone")}
                    className="sq-input lk-select"
                    aria-label={`Slide ${i + 1} colour`}
                    value={slide.tone}
                    onChange={(e) => change(setPlanTone(draft, i, e.target.value as SlideTone))}
                  >
                    {PLAN_TONES.map((tone) => (
                      <option key={tone} value={tone}>
                        {TONE_LABELS[tone]}
                      </option>
                    ))}
                  </select>
                  <div className="lk-slide-ctrl">
                    <button
                      type="button"
                      id={slideId(i, "up")}
                      className="sq-btn sq-btn-sm lk-ctrl"
                      aria-label={`Move slide ${i + 1} up`}
                      disabled={!canMovePlanSlide(draft, i, -1)}
                      onClick={() => onMove(i, -1)}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      id={slideId(i, "down")}
                      className="sq-btn sq-btn-sm lk-ctrl"
                      aria-label={`Move slide ${i + 1} down`}
                      disabled={!canMovePlanSlide(draft, i, 1)}
                      onClick={() => onMove(i, 1)}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className="sq-btn sq-btn-sm lk-ctrl"
                      aria-label={`Remove slide ${i + 1}`}
                      disabled={!canRemovePlanSlide(draft, i)}
                      title={
                        canRemovePlanSlide(draft, i)
                          ? undefined
                          : i === 0 || i === plan.length - 1
                            ? "The cover and the close stay."
                            : `A plan needs at least ${PLAN_MIN} slides.`
                      }
                      onClick={() => change(removePlanSlide(draft, i), `${uid}-add-slide`)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <div className="lk-row">
              <button
                type="button"
                id={`${uid}-add-slide`}
                className="sq-btn sq-btn-sm"
                disabled={!canAddPlanSlide(draft)}
                onClick={() => change(addPlanSlide(draft), slideId(plan.length - 1, "layout"))}
              >
                Add slide
              </button>
              <button type="button" className="sq-btn sq-btn-sm" onClick={() => change(removePlan(draft), `${uid}-start-plan`)}>
                Remove plan
              </button>
              {!canAddPlanSlide(draft) && <span className="t-meta">A PLAN HOLDS {PLAN_MAX} SLIDES AT MOST</span>}
            </div>
          </>
        ) : (
          <div className="lk-row">
            <button
              type="button"
              id={`${uid}-start-plan`}
              className="sq-btn sq-btn-sm"
              onClick={() => change(startPlan(draft), slideId(1, "layout"))}
            >
              Start a plan
            </button>
            <span className="lk-hint">A cover, a cards slide and a close to begin with.</span>
          </div>
        )}
      </div>

      <div className="lk-part">
        <div className="lk-part-head">
          <label className="lk-part-title" htmlFor={`${uid}-design`}>
            Design document
          </label>
          <span className={`t-meta lk-count${designUsed > DESIGN_MAX ? " is-over" : ""}`} aria-live="polite">
            {designCount(draft.design)}
          </span>
        </div>
        <p className="lk-hint">Markdown or plain words: the tone, how the text reads, what to avoid. Optional.</p>
        <textarea
          id={`${uid}-design`}
          className={`sq-input${designUsed > DESIGN_MAX ? " sq-input-error" : ""}`}
          rows={8}
          value={draft.design}
          aria-invalid={designUsed > DESIGN_MAX ? true : undefined}
          onChange={(e) => change({ ...draft, design: e.target.value })}
        />
        <div className="lk-row">
          <button type="button" className="sq-btn sq-btn-sm" onClick={() => designPicker.current?.click()}>
            Upload a .md or .txt file
          </button>
          <label htmlFor={`${uid}-design-file`} className="sq-sr">
            Upload a Markdown or text file as the design document
          </label>
          <input
            ref={designPicker}
            id={`${uid}-design-file`}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            className="sq-sr"
            tabIndex={-1}
            onChange={(e) => {
              void readDesignFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <span className="lk-hint">It replaces what is in the box.</span>
        </div>
        {designRefused && (
          <p className="lk-note" role="alert">
            {designRefused}
          </p>
        )}
      </div>

      <div className="lk-part" role="group" aria-labelledby={`${uid}-refs-title`}>
        <div className="lk-part-head">
          <span className="lk-part-title" id={`${uid}-refs-title`}>
            Reference images
          </span>
          <span className="t-meta">
            {draft.referenceIds.length + uploads.length} OF {REFERENCES_MAX}
          </span>
        </div>
        <div
          className="lk-drop"
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
            addImages(e.dataTransfer.files);
          }}
        >
          <UploadIcon />
          <div className="lk-drop-text">
            <b>Carousels you like</b>
            <span>Up to {REFERENCES_MAX} PNG, JPEG or WebP images, 5 MB each. Drop them here or choose files.</span>
          </div>
          <button
            type="button"
            id={`${uid}-choose-images`}
            className="sq-btn sq-btn-sm sq-btn-dark"
            disabled={busy || imageRoom <= 0}
            onClick={() => imagePicker.current?.click()}
          >
            {draft.referenceIds.length + uploads.length === 0 ? "Choose images" : "Add more"}
          </button>
          <label htmlFor={`${uid}-image-file`} className="sq-sr">
            Choose reference images
          </label>
          <input
            ref={imagePicker}
            id={`${uid}-image-file`}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            className="sq-sr"
            tabIndex={-1}
            disabled={busy}
            onChange={(e) => {
              addImages(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        {refused.length > 0 && (
          <ul className="lk-notes" role="alert" aria-label="Files that were not added">
            {refused.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        {(draft.referenceIds.length > 0 || uploads.length > 0) && (
          <ul className="lk-refs" aria-label="Reference images">
            {draft.referenceIds.map((id, i) => {
              const asset = assetById.get(id);
              const src = asset?.publicUrl ?? previews[id];
              const label = asset?.filename ? `: ${asset.filename}` : "";
              return (
                <li className="lk-ref" key={id}>
                  {src ? (
                    // The image is on the founder's own storage URL (or a local preview), so next/image cannot size it.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt={`Reference image ${i + 1}${label}`} />
                  ) : (
                    <span className="sq-sk lk-ref-skeleton" aria-hidden="true" />
                  )}
                  <span className="lk-ref-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    className="sq-btn sq-btn-sm lk-ctrl"
                    aria-label={`Remove reference image ${i + 1}${label}`}
                    disabled={busy}
                    onClick={() => change(removeReference(draft, id), `${uid}-choose-images`)}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
            {uploads.map((u) => (
              <li className="lk-ref lk-ref-up" key={`up-${u.uid}`}>
                <span className="lk-ref-name">{u.name}</span>
                <progress className="lk-progress" max={100} value={u.percent} aria-label={`Uploading ${u.name}`} />
                <button type="button" className="sq-btn sq-btn-sm lk-ctrl" aria-label={`Cancel the upload of ${u.name}`} onClick={() => cancelUpload(u.uid)}>
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {attempted && problems.length > 0 && (
        <ul className="lk-notes" id={errorId} role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {serverError && (
        <p className="sq-error-box" role="alert">
          {serverError}
        </p>
      )}
      <div className="lk-actions">
        <button type="button" className="sq-btn sq-btn-primary lk-save" disabled={busy || uploads.length > 0} onClick={() => void onSave()}>
          {busy ? "Saving…" : uploads.length > 0 ? "Uploading…" : isNew ? "Save look" : "Save changes"}
        </button>
        <button type="button" className="sq-btn" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
      {!isNew && <p className="lk-hint">Carousels already written keep the design they were made with; new ones follow the changes.</p>}
    </section>
  );
}
