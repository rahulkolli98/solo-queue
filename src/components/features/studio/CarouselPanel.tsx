"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { LIMITS, SLIDE_TONES, splitHeadline, type Slide, type SlideLayout, type SlideTone } from "../../../../convex/lib/carouselSlides";
import { AlertIcon } from "@/components/ui/icons";
import CarouselCaption from "@/components/features/studio/CarouselCaption";
import { OwnCarouselEditor, OwnCarouselStart } from "@/components/features/studio/OwnCarousel";
import SaveLook from "@/components/features/studio/SaveLook";
import { planFromSlides } from "../../../../convex/lib/looks";
import SlidePreview from "@/components/features/studio/SlidePreview";
import type { GenState } from "@/components/features/studio/types";
import { useCarouselRender } from "@/components/features/studio/useCarouselRender";
import {
  LAYOUT_LABELS,
  MAX_CARDS,
  MAX_ITEMS,
  MAX_PILLS,
  MAX_SLIDES,
  MIN_SLIDES,
  SLIDE_LAYOUTS,
  TONE_LABELS,
  addCard,
  addItem,
  addPill,
  addSlide,
  moveSlide,
  normalizeSlide,
  removeCard,
  removeItem,
  removePill,
  removeSlide,
  setLayout,
  slideProblems,
  slidesEqual,
  updateCard,
  updateItem,
  updatePill,
} from "@/lib/carouselEditor";
import { studioErrorText } from "@/lib/studioErrors";
import { useNow } from "@/lib/useNow";
import { useTwoTap } from "@/lib/useTwoTap";
import { VERIFIED_TTL_MS } from "../../../../convex/lib/slots";

export interface CarouselPanelProps {
  /** The topic the carousel belongs to (an own-images carousel is created on it). */
  topicId: string;
  /** The carousel draft (a `drafts` row with `slides`); undefined until one is written. */
  draft: Doc<"drafts"> | undefined;
  gen: GenState;
  /** Write the carousel (the Studio's generate for this format). */
  onWrite: () => void;
  /** The founder's never-use words (Settings, Voice): a caption that uses one is flagged. */
  bannedWords?: string[];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** What to do next after a failed write; there is no "write it yourself" for slides. */
function nextStep(code: string | null | undefined): string {
  switch (code) {
    case "LLM_PRIVACY":
    case "LLM_AUTH":
    case "LLM_CREDITS":
    case "LLM_MODEL":
    case "LLM_NOT_CONFIGURED":
      return "Fix that in your AI provider or deployment settings, then press Retry.";
    case "LLM_RATE_LIMIT":
      return "Wait a minute, then press Retry.";
    default:
      return "Press Retry.";
  }
}

function Skeleton({ elapsed }: { elapsed: string }) {
  return (
    <div aria-busy="true" className="studio-cr-skeleton">
      <div className="studio-cr-skeleton-row">
        {[0, 1, 2, 3].map((i) => (
          <span className="sq-sk studio-cr-skeleton-tile" key={i} />
        ))}
      </div>
      <span className="sq-sk studio-sk-line" />
      <span className="sq-sk studio-sk-line" data-w="72" />
      <span className="t-mono studio-foot-hot">WRITING THE CAROUSEL… {elapsed}</span>
    </div>
  );
}

function EmptyState({ gen, onWrite, onOwn }: { gen: GenState; onWrite: () => void; onOwn: () => void }) {
  if (gen.error) {
    return (
      <div className="studio-errcard" role="alert">
        <div className="studio-errcard-head">
          <AlertIcon />
          <b>Couldn&apos;t write the carousel</b>
        </div>
        <p className="studio-errcard-reason">{gen.error}</p>
        <p className="studio-errcard-next">{nextStep(gen.errorCode)} The topic and your other drafts are saved.</p>
        <div className="studio-actions-row">
          <button type="button" className="sq-btn sq-btn-sm sq-btn-dark" onClick={gen.onRetry} disabled={gen.retrying}>
            {gen.retrying ? "Retrying…" : "Retry"}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="studio-cr-empty">
      {gen.writing ? (
        <Skeleton elapsed={gen.elapsed} />
      ) : (
        <p className="studio-empty-copy">
          A carousel is {MIN_SLIDES} to {MAX_SLIDES} slides ({MIN_SLIDES} slide is a single statement post). Press Write the carousel, or tick Carousel in the setup line and Generate.
        </p>
      )}
      <div className="studio-actions-row">
        <button type="button" className="sq-btn sq-btn-sm sq-btn-dark" onClick={onWrite} disabled={gen.writing}>
          {gen.writing ? "Writing the carousel…" : "Write the carousel"}
        </button>
        <button type="button" className="sq-btn sq-btn-sm" onClick={onOwn} disabled={gen.writing}>
          Use my own images
        </button>
      </div>
    </div>
  );
}

/* ---- form fields ---- */

function TextField({
  id,
  label,
  value,
  onChange,
  onBlur,
  max,
  hint,
  multiline,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  max: number;
  hint?: ReactNode;
  multiline?: boolean;
  placeholder?: string;
}) {
  const length = multiline ? value.length : value.trim().length;
  const over = length > max;
  const near = over || length >= max * 0.8;
  const describedBy = [hint ? `${id}-hint` : null, near ? `${id}-count` : null].filter(Boolean).join(" ") || undefined;
  const shared = {
    id,
    className: "sq-input studio-cr-input",
    value,
    placeholder,
    "aria-describedby": describedBy,
    "aria-invalid": over || undefined,
    onBlur,
  };
  return (
    <div className="studio-cr-field">
      <label htmlFor={id} className="studio-cr-label">
        {label}
      </label>
      {multiline ? (
        <textarea rows={2} {...shared} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type="text" {...shared} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && (
        <span id={`${id}-hint`} className="studio-cr-hint">
          {hint}
        </span>
      )}
      {near && (
        <span id={`${id}-count`} className="studio-cr-count" data-over={over || undefined}>
          {length} / {max}
        </span>
      )}
    </div>
  );
}

function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="studio-cr-field">
      <label htmlFor={id} className="studio-cr-label">
        {label}
      </label>
      <select id={id} className="sq-input studio-cr-input" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const LAYOUT_OPTIONS = SLIDE_LAYOUTS.map((value) => ({ value, label: LAYOUT_LABELS[value] }));
const TONE_OPTIONS = SLIDE_TONES.map((value) => ({ value, label: TONE_LABELS[value] }));

/** The form for the selected slide. Typing changes the local slides; leaving a field (or a select change) saves. */
function SlideForm({
  slide,
  position,
  onEdit,
  onCommit,
  onSave,
}: {
  slide: Slide;
  position: number;
  /** Change the slide, keep it local (saved on blur). */
  onEdit: (change: (s: Slide) => Slide) => void;
  /** Change the slide and save now. */
  onCommit: (change: (s: Slide) => Slide) => void;
  onSave: () => void;
}) {
  const uid = useId();
  const id = (name: string) => `${uid}-${position}-${name}`;
  const accentMissing =
    !!slide.accent?.trim() && !splitHeadline(slide.headline, slide.accent).flat().some((w) => w.accent);
  const hasSub = slide.layout !== "list";
  const cards = slide.cards ?? [];
  const items = slide.items ?? [];
  const pills = slide.pills ?? [];

  return (
    <div className="studio-cr-form">
      <div className="studio-cr-row">
        <SelectField
          id={id("layout")}
          label="Layout"
          value={slide.layout}
          options={LAYOUT_OPTIONS}
          onChange={(layout: SlideLayout) => onCommit((s) => setLayout(s, layout))}
        />
        <SelectField
          id={id("tone")}
          label="Colour"
          value={slide.tone}
          options={TONE_OPTIONS}
          onChange={(tone: SlideTone) => onCommit((s) => ({ ...s, tone }))}
        />
      </div>
      <TextField
        id={id("kicker")}
        label="Kicker"
        value={slide.kicker ?? ""}
        max={LIMITS.kicker}
        onChange={(kicker) => onEdit((s) => ({ ...s, kicker }))}
        onBlur={onSave}
      />
      <TextField
        id={id("headline")}
        label="Headline"
        value={slide.headline}
        max={LIMITS.headline}
        multiline
        hint="Use Enter for a line break."
        onChange={(headline) => onEdit((s) => ({ ...s, headline }))}
        onBlur={onSave}
      />
      <TextField
        id={id("accent")}
        label="Accent word"
        value={slide.accent ?? ""}
        max={LIMITS.accent}
        hint={accentMissing ? "That word is not in the headline, so nothing is highlighted." : "A word from the headline, drawn in the accent colour."}
        onChange={(accent) => onEdit((s) => ({ ...s, accent }))}
        onBlur={onSave}
      />
      {hasSub && (
        <TextField
          id={id("sub")}
          label="Italic line"
          value={slide.sub ?? ""}
          max={LIMITS.sub}
          multiline
          onChange={(sub) => onEdit((s) => ({ ...s, sub }))}
          onBlur={onSave}
        />
      )}

      {slide.layout === "statement" && (
        <TextField
          id={id("tag")}
          label="Tag"
          value={slide.tag ?? ""}
          max={LIMITS.tag}
          hint="Small line at the bottom right, like Build in public."
          onChange={(tag) => onEdit((s) => ({ ...s, tag }))}
          onBlur={onSave}
        />
      )}

      {slide.layout === "cards" && (
        <div className="studio-cr-list">
          {cards.map((card, k) => (
            <fieldset className="studio-cr-group" key={k}>
              <legend>Card {k + 1}</legend>
              <div className="studio-cr-row">
                <TextField
                  id={id(`card${k}-label`)}
                  label="Label"
                  value={card.label ?? ""}
                  max={LIMITS.cardLabel}
                  onChange={(label) => onEdit((s) => updateCard(s, k, { label }))}
                  onBlur={onSave}
                />
                <TextField
                  id={id(`card${k}-big`)}
                  label="Big figure"
                  value={card.big ?? ""}
                  max={LIMITS.cardBig}
                  hint="Optional, like 60d."
                  onChange={(big) => onEdit((s) => updateCard(s, k, { big }))}
                  onBlur={onSave}
                />
              </div>
              <TextField
                id={id(`card${k}-text`)}
                label="Card text"
                value={card.text}
                max={LIMITS.cardText}
                multiline
                onChange={(text) => onEdit((s) => updateCard(s, k, { text }))}
                onBlur={onSave}
              />
              <div className="studio-cr-row studio-cr-row-end">
                <SelectField
                  id={id(`card${k}-tone`)}
                  label="Card colour"
                  value={card.tone}
                  options={TONE_OPTIONS}
                  onChange={(tone) => onCommit((s) => updateCard(s, k, { tone }))}
                />
                <button
                  type="button"
                  className="sq-btn sq-btn-sm studio-cr-btn"
                  aria-label={`Remove card ${k + 1}`}
                  onClick={() => onCommit((s) => removeCard(s, k))}
                >
                  Remove
                </button>
              </div>
            </fieldset>
          ))}
          <div className="studio-actions-row">
            <button
              type="button"
              className="sq-btn sq-btn-sm studio-cr-btn"
              disabled={cards.length >= MAX_CARDS}
              onClick={() => onCommit(addCard)}
            >
              Add card
            </button>
            <span className="t-meta">
              {cards.length} / {MAX_CARDS} CARDS
            </span>
          </div>
        </div>
      )}

      {slide.layout === "list" && (
        <div className="studio-cr-list">
          {items.map((item, k) => (
            <fieldset className="studio-cr-group" key={k}>
              <legend>Item {k + 1}</legend>
              <TextField
                id={id(`item${k}-label`)}
                label="Label"
                value={item.label ?? ""}
                max={LIMITS.cardLabel}
                onChange={(label) => onEdit((s) => updateItem(s, k, { label }))}
                onBlur={onSave}
              />
              <TextField
                id={id(`item${k}-text`)}
                label="Item text"
                value={item.text}
                max={LIMITS.itemText}
                multiline
                onChange={(text) => onEdit((s) => updateItem(s, k, { text }))}
                onBlur={onSave}
              />
              <button
                type="button"
                className="sq-btn sq-btn-sm studio-cr-btn"
                aria-label={`Remove item ${k + 1}`}
                onClick={() => onCommit((s) => removeItem(s, k))}
              >
                Remove
              </button>
            </fieldset>
          ))}
          <div className="studio-actions-row">
            <button
              type="button"
              className="sq-btn sq-btn-sm studio-cr-btn"
              disabled={items.length >= MAX_ITEMS}
              onClick={() => onCommit(addItem)}
            >
              Add item
            </button>
            <span className="t-meta">
              {items.length} / {MAX_ITEMS} ITEMS
            </span>
          </div>
        </div>
      )}

      {slide.layout === "close" && (
        <div className="studio-cr-list">
          {pills.map((pill, k) => (
            <div className="studio-cr-pillrow" key={k}>
              <TextField
                id={id(`pill${k}`)}
                label={`Pill ${k + 1}`}
                value={pill}
                max={LIMITS.pill}
                onChange={(text) => onEdit((s) => updatePill(s, k, text))}
                onBlur={onSave}
              />
              <button
                type="button"
                className="sq-btn sq-btn-sm studio-cr-btn"
                aria-label={`Remove pill ${k + 1}`}
                onClick={() => onCommit((s) => removePill(s, k))}
              >
                Remove
              </button>
            </div>
          ))}
          <div className="studio-actions-row">
            <button
              type="button"
              className="sq-btn sq-btn-sm studio-cr-btn"
              disabled={pills.length >= MAX_PILLS}
              onClick={() => onCommit(addPill)}
            >
              Add pill
            </button>
            <span className="t-meta">
              {pills.length} / {MAX_PILLS} PILLS
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- the editor ---- */

function CarouselEditor({
  draft,
  serverSlides,
  gen,
  bannedWords,
  onUseOwn,
}: {
  draft: Doc<"drafts">;
  serverSlides: Slide[];
  gen: GenState;
  bannedWords?: string[];
  onUseOwn: () => void;
}) {
  const updateSlides = useMutation(api.drafts.updateSlides);
  const imageIds = draft.mediaAssetIds ?? [];
  const assets = useQuery(api.media.byIds, imageIds.length > 0 ? { ids: imageIds.slice(0, 10) } : "skip");
  const verifyImage = useAction(api.media.verify);
  const now = useNow();
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const draw = useCarouselRender({ draft });
  const removeTap = useTwoTap();

  // What is on screen (`slides`), what the server last held (`serverSeen`), what is known saved (`saved`).
  const [slides, setSlides] = useState<Slide[]>(serverSlides);
  const [serverSeen, setServerSeen] = useState<Slide[]>(serverSlides);
  const [saved, setSaved] = useState<Slide[]>(serverSlides);
  const [selected, setSelected] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!slidesEqual(serverSeen, serverSlides)) {
    // The saved slides changed (our own save arriving, or a rewrite): follow them unless there are unsaved edits.
    const clean = slidesEqual(slides, saved);
    setServerSeen(serverSlides);
    setSaved(serverSlides);
    if (clean && !slidesEqual(slides, serverSlides)) setSlides(serverSlides);
  }

  const slidesRef = useRef(slides);
  const savedRef = useRef(saved);
  const imagesRef = useRef(imageIds);
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const thumbs = useRef<(HTMLButtonElement | null)[]>([]);
  const discard = draw.discardImages;
  useEffect(() => {
    slidesRef.current = slides;
    savedRef.current = saved;
    imagesRef.current = draft.mediaAssetIds ?? [];
  });

  const total = slides.length;
  const at = Math.min(selected, total - 1);
  const current = slides[at];
  const problems = slideProblems(slides);
  const badSlides = problems.flatMap((p, i) => (p.length > 0 ? [i + 1] : []));
  const dirty = !slidesEqual(slides, saved);
  const attached = imageIds.length > 0;
  const busy = draw.state === "rendering" || draw.state === "attaching";
  // Queueing needs every image checked reachable within the last day (Instagram fetches them itself).
  const needsCheck = attached && assets !== undefined && assets.some((a) => !a.verifiedAt || now - a.verifiedAt > VERIFIED_TTL_MS);

  async function checkImages() {
    setChecking(true);
    setCheckError(null);
    try {
      for (const id of imageIds) await verifyImage({ id });
    } catch (e) {
      setCheckError(studioErrorText(e, "Couldn't check the images. Try again."));
    } finally {
      setChecking(false);
    }
  }

  function apply(next: Slide[]) {
    slidesRef.current = next;
    setSlides(next);
  }

  /** Save the slides as they are now. Resolves true when the server has them (or already had them). */
  function save(): Promise<boolean> {
    const run = async (): Promise<boolean> => {
      const next = slidesRef.current;
      if (slidesEqual(next, savedRef.current)) return true;
      if (slideProblems(next).some((p) => p.length > 0)) return false;
      const hadImages = imagesRef.current;
      setSaving(true);
      setSaveError(null);
      try {
        await updateSlides({ id: draft._id, slides: next.map(normalizeSlide) });
        savedRef.current = next;
        setSaved(next);
        // The drawn images no longer match; nothing points at them now, so clear them out of the library.
        if (hadImages.length > 0) void discard(hadImages);
        return true;
      } catch (e) {
        setSaveError(studioErrorText(e, "Couldn't save the slides. Your edits are still here. Try again."));
        return false;
      } finally {
        setSaving(false);
      }
    };
    const next = chain.current.then(run, run);
    chain.current = next;
    return next;
  }

  const edit = (change: (s: Slide) => Slide) => apply(slides.map((s, i) => (i === at ? change(s) : s)));
  const commit = (change: (s: Slide) => Slide) => {
    edit(change);
    void save();
  };

  function select(index: number, focus = false) {
    removeTap.reset();
    setSelected(index);
    if (focus) thumbs.current[index]?.focus();
  }
  function structural(next: Slide[], nextSelected: number) {
    removeTap.reset();
    apply(next);
    setSelected(nextSelected);
    void save();
  }
  function onStripKey(e: KeyboardEvent<HTMLOListElement>) {
    const last = total - 1;
    const to =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? Math.min(at + 1, last)
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? Math.max(at - 1, 0)
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (to === null) return;
    e.preventDefault();
    select(to, true);
  }

  async function drawSlides() {
    if (!(await save())) return;
    await draw.render(slidesRef.current);
  }

  const byId = new Map((assets ?? []).map((a) => [a._id as string, a]));
  const downloads = imageIds.map((id, k) => ({ n: k + 1, asset: byId.get(id) })).filter((d) => d.asset);

  let status: ReactNode;
  if (draw.state === "rendering") {
    status = `Drawing ${Math.min(draw.progress.done + 1, draw.progress.total)} of ${draw.progress.total}…`;
  } else if (draw.state === "attaching") {
    status = `Saving the images: ${draw.progress.done} of ${draw.progress.total}…`;
  } else if (saving) {
    status = "Saving the slides…";
  } else if (badSlides.length > 0) {
    status = `Fix ${badSlides.length === 1 ? "slide" : "slides"} ${badSlides.join(", ")} before saving or drawing.`;
  } else if (dirty) {
    status = "Slide edits are not saved yet.";
  } else if (attached) {
    status = `${imageIds.length} slide ${imageIds.length === 1 ? "image" : "images"} attached.${needsCheck ? " They need a check before the carousel can be queued." : ""}`;
  } else {
    status = "No slide images yet. Draw the slides to make them.";
  }

  return (
    <div className="studio-cr">
      <div className="studio-cr-head">
        <span className="t-meta">
          {total === 1 ? "SINGLE SLIDE POST" : `CAROUSEL · ${total} SLIDES`}
        </span>
      </div>

      <ol className="studio-cr-strip" aria-label="Slides" onKeyDown={onStripKey}>
        {slides.map((slide, i) => {
          const bad = problems[i].length > 0;
          return (
            <li key={i}>
              <button
                type="button"
                ref={(el) => {
                  thumbs.current[i] = el;
                }}
                className="studio-cr-thumb"
                aria-current={i === at ? "true" : undefined}
                aria-label={`Slide ${i + 1} of ${total}: ${slide.headline.replace(/\s+/g, " ").trim() || "no headline"}${bad ? ". Has a problem." : ""}`}
                data-bad={bad || undefined}
                tabIndex={i === at ? 0 : -1}
                onClick={() => select(i)}
              >
                <SlidePreview slide={slide} index={i} total={total} theme={draft.theme} decorative />
                <span className="studio-cr-thumb-n" aria-hidden="true">
                  {bad ? "!" : i + 1}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="studio-cr-body">
        <div className="studio-cr-stage">
          <SlidePreview slide={current} index={at} total={total} theme={draft.theme} />
        </div>

        <div className="studio-cr-editor" role="group" aria-label={`Slide ${at + 1} of ${total}`}>
          <div className="studio-actions-row studio-cr-tools">
            <button
              type="button"
              className="sq-btn sq-btn-sm studio-cr-btn"
              disabled={at === 0}
              onClick={() => structural(moveSlide(slides, at, -1), at - 1)}
            >
              Move left
            </button>
            <button
              type="button"
              className="sq-btn sq-btn-sm studio-cr-btn"
              disabled={at === total - 1}
              onClick={() => structural(moveSlide(slides, at, 1), at + 1)}
            >
              Move right
            </button>
            <button
              type="button"
              className="sq-btn sq-btn-sm studio-cr-btn"
              disabled={total >= MAX_SLIDES}
              onClick={() => structural(addSlide(slides, at), at + 1)}
            >
              Add slide after
            </button>
            <button
              type="button"
              className="sq-btn sq-btn-sm studio-cr-btn"
              disabled={total <= MIN_SLIDES}
              onClick={() => removeTap.tap(() => structural(removeSlide(slides, at), Math.min(at, total - 2)))}
            >
              {removeTap.armed ? "Tap again to remove" : "Remove slide"}
            </button>
          </div>
          <p className="t-meta studio-cr-limits">
            {total} / {MAX_SLIDES} SLIDES · {MIN_SLIDES} TO {MAX_SLIDES} ALLOWED
          </p>

          {problems[at].length > 0 && (
            <ul className="studio-cr-problems" aria-live="polite" aria-label="What to fix on this slide">
              {problems[at].map((p) => (
                <li key={p} className="studio-inline-error">
                  {p}
                </li>
              ))}
            </ul>
          )}

          <SlideForm
            key={at}
            slide={current}
            position={at}
            onEdit={edit}
            onCommit={commit}
            onSave={() => void save()}
          />
        </div>
      </div>

      <CarouselCaption draft={draft} bannedWords={bannedWords} />

      <div className="studio-cr-statusbar">
        <p className="studio-cr-status" role="status" aria-live="polite">
          {status}
        </p>
        {attached && (
          <p className="studio-cr-note">Editing slides removes the drawn images. Draw the slides again.</p>
        )}
        {(draw.error || saveError || checkError) && (
          <p className="studio-inline-error" role="alert">
            {draw.error ?? saveError ?? checkError}
          </p>
        )}
        <div className="studio-actions-row">
          <button
            type="button"
            className={`sq-btn sq-btn-sm ${attached && !dirty ? "" : "sq-btn-dark"} studio-cr-btn`}
            disabled={busy || saving || badSlides.length > 0 || gen.writing}
            onClick={() => void drawSlides()}
          >
            {busy ? "Drawing…" : attached && !dirty ? "Draw the slides again" : "Draw the slides"}
          </button>
          {needsCheck && !dirty && (
            <button type="button" className="sq-btn sq-btn-sm sq-btn-primary studio-cr-btn" disabled={checking || busy} onClick={() => void checkImages()}>
              {checking ? "Checking…" : "Check the images"}
            </button>
          )}
          {dirty && (
            <button
              type="button"
              className="sq-btn sq-btn-sm studio-cr-btn"
              disabled={saving || badSlides.length > 0}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save slides"}
            </button>
          )}
          <button type="button" className="sq-btn sq-btn-sm studio-cr-btn" disabled={busy || saving || gen.writing} onClick={onUseOwn}>
            Use my own images instead
          </button>
          {total >= 2 && badSlides.length === 0 && (
            <SaveLook
              label="Save as a look"
              hint={`Saves the layout and colour of each of these ${total} slides as a look. It never saves the words, so you can write a new carousel in the same shape.`}
              parts={{ plan: planFromSlides(slides) ?? undefined }}
              disabled={busy || saving || gen.writing}
            />
          )}
        </div>
        {attached && !dirty && downloads.length > 0 && (
          <div className="studio-cr-downloads">
            <span className="t-meta">DOWNLOAD ALL</span>
            <ul>
              {downloads.map(({ n, asset }) => (
                <li key={n}>
                  <a
                    className="studio-open studio-cr-link"
                    href={asset?.publicUrl}
                    download={asset?.filename ?? `slide-${pad(n)}.png`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Download slide ${n}`}
                  >
                    Slide {n}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/** The Instagram carousel: its slides (a filmstrip, a large preview and a form), its caption and the drawn images. */
export default function CarouselPanel({ topicId, draft, gen, onWrite, bannedWords }: CarouselPanelProps) {
  const [own, setOwn] = useState(false);
  if (own && !gen.writing) {
    return (
      <OwnCarouselStart
        topicId={topicId}
        replacing={Boolean(draft?.slides?.length)}
        onDone={() => setOwn(false)}
        onCancel={() => setOwn(false)}
      />
    );
  }
  if (draft?.slides && draft.slides.length > 0 && !gen.writing) {
    // The founder's own images have no slides to edit or draw: they get their own editor.
    if (draft.slideSource === "uploaded") return <OwnCarouselEditor key={draft._id} draft={draft} bannedWords={bannedWords} />;
    return (
      <CarouselEditor key={draft._id} draft={draft} serverSlides={draft.slides as Slide[]} gen={gen} bannedWords={bannedWords} onUseOwn={() => setOwn(true)} />
    );
  }
  if (draft && gen.writing) return <Skeleton elapsed={gen.elapsed} />;
  return <EmptyState gen={gen} onWrite={onWrite} onOwn={() => setOwn(true)} />;
}
