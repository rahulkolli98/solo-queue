"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import FormField from "@/components/ui/FormField";
import { FRAME_FORMATS, type FrameFormat } from "@/lib/frameDefaults";
import {
  HINT_MAX,
  LABEL_MAX,
  MAX_BEATS,
  NAME_MAX,
  POST_MAX,
  addBeat,
  buildSaveArgs,
  canAddBeat,
  canPropose,
  canRemoveBeat,
  defaultButtonLabel,
  defaultSource,
  draftFromProposal,
  formatLabel,
  libraryFrameHref,
  postCountLabel,
  proposeArgs,
  removeBeat,
  savedMessage,
  setBeat,
  setName,
  showsSourceChoice,
  sourceLabel,
  type ProposalDraft,
  type ProposerSource,
} from "@/lib/frameProposer";
import { refusalText } from "@/lib/refusalText";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useFrameDefaultSave } from "../library/useFrames";

type Stage = "form" | "edit" | "saved";

const SOURCES: ProposerSource[] = ["topic", "post"];

function Choice<T extends string>({
  title,
  options,
  value,
  onChoose,
}: {
  title: string;
  options: { value: T; label: string }[];
  value: T;
  onChoose: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="fp-field" role="radiogroup" aria-labelledby={id}>
      <span className="fp-title" id={id}>
        {title}
      </span>
      <div className="fp-choices">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            className="fp-choice"
            aria-checked={o.value === value}
            onClick={() => onChoose(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Step 1: where the beats come from, the format, and the one button. */
export function ProposerForm({
  topic,
  sources,
  source,
  text,
  format,
  busy,
  error,
  onSource,
  onText,
  onFormat,
  onSubmit,
}: {
  topic?: { title: string };
  sources: readonly ProposerSource[];
  source: ProposerSource;
  text: string;
  format: FrameFormat;
  busy: boolean;
  error: string | null;
  onSource: (source: ProposerSource) => void;
  onText: (text: string) => void;
  onFormat: (format: FrameFormat) => void;
  onSubmit: () => void;
}) {
  const ready = canPropose({ source, text, busy, hasTopic: topic !== undefined });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (ready) onSubmit();
  }
  return (
    <form className="fp-form" onSubmit={submit}>
      {showsSourceChoice(sources) && (
        <Choice
          title="Learn from"
          value={source}
          onChoose={onSource}
          options={SOURCES.map((s) => ({ value: s, label: sourceLabel(s) }))}
        />
      )}
      {source === "topic" && topic && (
        <p className="fp-hint">
          Suggests beats that would suit &ldquo;{topic.title}&rdquo;. Nothing is saved until you say so.
        </p>
      )}
      {source === "post" && (
        <FormField label="The post" hint={postCountLabel(text)}>
          <textarea
            rows={5}
            value={text}
            maxLength={POST_MAX}
            placeholder="Paste a post that worked."
            disabled={busy}
            onChange={(e) => onText(e.target.value)}
          />
        </FormField>
      )}
      <Choice
        title="Format"
        value={format}
        onChoose={onFormat}
        options={FRAME_FORMATS.map((f) => ({ value: f.kind, label: f.label }))}
      />
      <div className="fp-actions">
        <button type="submit" className="sq-btn sq-btn-primary" disabled={!ready}>
          Propose beats
        </button>
      </div>
      {busy && (
        <p className="fp-hint" role="status">
          Writing the beats…
        </p>
      )}
      {error && (
        <p className="sq-formfield-error fp-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/** Step 2: the proposal, editable. Nothing is saved until "Save frame". */
export function ProposerEdit({
  draft,
  busy,
  error,
  onChange,
  onSave,
  onStartOver,
}: {
  draft: ProposalDraft;
  busy: boolean;
  error: string | null;
  onChange: (next: ProposalDraft) => void;
  onSave: () => void;
  onStartOver: () => void;
}) {
  return (
    <div className="fp-edit">
      <FormField label="Frame name">
        <input type="text" value={draft.name} maxLength={NAME_MAX} onChange={(e) => onChange(setName(draft, e.target.value))} />
      </FormField>
      <p className="fp-hint">
        For {formatLabel(draft.format)}. 2 to {MAX_BEATS} beats.
      </p>
      <ol className="fp-beats">
        {draft.beats.map((beat, i) => (
          <li key={i} className="fp-beat">
            <span className="fp-beat-num" aria-hidden="true">
              {i + 1}
            </span>
            <div className="fp-beat-fields">
              <input
                type="text"
                className="sq-input"
                aria-label={`Beat ${i + 1} name`}
                placeholder="Name"
                value={beat.label}
                maxLength={LABEL_MAX}
                onChange={(e) => onChange(setBeat(draft, i, "label", e.target.value))}
              />
              <input
                type="text"
                className="sq-input"
                aria-label={`Beat ${i + 1} hint`}
                placeholder="What goes here"
                value={beat.hint}
                maxLength={HINT_MAX}
                onChange={(e) => onChange(setBeat(draft, i, "hint", e.target.value))}
              />
            </div>
            <button
              type="button"
              className="sq-btn fp-remove"
              aria-label={`Remove beat ${i + 1}`}
              disabled={!canRemoveBeat(draft)}
              onClick={() => onChange(removeBeat(draft, i))}
            >
              Remove
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="sq-btn fp-add" disabled={!canAddBeat(draft)} onClick={() => onChange(addBeat(draft))}>
        Add beat
      </button>
      {error && (
        <p className="sq-formfield-error fp-error" role="alert">
          {error}
        </p>
      )}
      <div className="fp-actions">
        <button type="button" className="sq-btn sq-btn-primary" disabled={busy} onClick={onSave}>
          {busy ? "Saving…" : "Save frame"}
        </button>
        <button type="button" className="sq-btn" disabled={busy} onClick={onStartOver}>
          Start over
        </button>
      </div>
    </div>
  );
}

/** Step 3: where it went, and the optional default. */
export function ProposerSaved({
  name,
  frameKey,
  format,
  canSetDefault,
  defaultSet,
  defaultBusy,
  defaultError,
  onMakeDefault,
  onAnother,
  onDone,
}: {
  name: string;
  frameKey: string;
  format: FrameFormat;
  /** The saved settings are loaded, so the default can be written. */
  canSetDefault: boolean;
  defaultSet: boolean;
  defaultBusy: boolean;
  defaultError: string | null;
  onMakeDefault: () => void;
  onAnother: () => void;
  onDone?: () => void;
}) {
  return (
    <div className="fp-saved">
      <p className="fp-saved-text" role="status">
        {savedMessage(name, format)}
      </p>
      <div className="fp-actions">
        <Link href={libraryFrameHref(frameKey)} className="sq-btn sq-btn-primary">
          Open in Library
        </Link>
        {canSetDefault && (
          <button type="button" className="sq-btn" disabled={defaultBusy || defaultSet} onClick={onMakeDefault}>
            {defaultSet ? `Your default for ${formatLabel(format)}` : defaultButtonLabel(format)}
          </button>
        )}
        <button type="button" className="sq-btn" onClick={onAnother}>
          Make another
        </button>
        {onDone && (
          <button type="button" className="sq-btn" onClick={onDone}>
            Close
          </button>
        )}
      </div>
      {defaultError && (
        <p className="sq-formfield-error fp-error" role="alert">
          {defaultError}
        </p>
      )}
    </div>
  );
}

/**
 * Proposes a story frame from a topic or a pasted post, lets the founder adjust it, and saves it as a
 * frame. Every step is optional and nothing is saved until "Save frame". Built from `lib/frameProposer`.
 */
export function FrameProposer({
  topic,
  sources,
  frames,
  onDone,
}: {
  topic?: { id: Id<"topics">; title: string };
  sources: ProposerSource[];
  frames: { key: string }[];
  onDone?: () => void;
}) {
  const propose = useAction(api.frameProposal.propose);
  const saveFrame = useMutation(api.frames.save);
  const settings = useQuery(api.settings.get);
  const defaults = useFrameDefaultSave();

  const [stage, setStage] = useState<Stage>("form");
  const [source, setSource] = useState<ProposerSource>(() => defaultSource(sources));
  const [text, setText] = useState("");
  const [format, setFormat] = useState<FrameFormat>("threads");
  const [draft, setDraft] = useState<ProposalDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ key: string; name: string; format: FrameFormat } | null>(null);
  const [defaultSet, setDefaultSet] = useState(false);
  const stepRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  // A new step starts at its top, so a keyboard or screen-reader user is not left on a button that is gone.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    stepRef.current?.focus();
  }, [stage]);

  // With one source on offer the choice is not shown, so the source follows what is on offer.
  const activeSource: ProposerSource = sources.includes(source) ? source : defaultSource(sources);

  async function onPropose() {
    const args = proposeArgs<Id<"topics">>({ source: activeSource, format, topicId: topic?.id, text });
    if (!args) return;
    setBusy(true);
    setError(null);
    try {
      const res = await propose(args);
      setDraft(draftFromProposal(res));
      setStage("edit");
    } catch (err) {
      setError(refusalText(err, "Could not propose beats. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (!draft) return;
    const built = buildSaveArgs(
      draft,
      frames.map((f) => f.key)
    );
    if (!built.ok) {
      setError(built.message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await saveFrame(built.args);
      setSaved({ key: res.key, name: built.args.name, format: draft.format });
      setDefaultSet(false);
      setStage("saved");
    } catch (err) {
      setError(refusalText(err, "Could not save the frame. Try again."));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStage("form");
    setDraft(null);
    setSaved(null);
    setDefaultSet(false);
    setError(null);
  }

  async function onMakeDefault() {
    const voice = settings?.voice;
    if (!voice || !saved) return;
    if (await defaults.setDefault(voice, saved.format, saved.key, true)) setDefaultSet(true);
  }

  return (
    <div className="fp" aria-label="Make a story frame" role="group">
      <div className="fp-step" ref={stepRef} tabIndex={-1}>
        {stage === "form" && (
          <ProposerForm
            topic={topic}
            sources={sources}
            source={activeSource}
            text={text}
            format={format}
            busy={busy}
            error={error}
            onSource={(s) => {
              setSource(s);
              setError(null);
            }}
            onText={(t) => {
              setText(t);
              setError(null);
            }}
            onFormat={setFormat}
            onSubmit={() => void onPropose()}
          />
        )}
        {stage === "edit" && draft && (
          <ProposerEdit
            draft={draft}
            busy={busy}
            error={error}
            onChange={(next) => {
              setDraft(next);
              setError(null);
            }}
            onSave={() => void onSave()}
            onStartOver={reset}
          />
        )}
        {stage === "saved" && saved && (
          <ProposerSaved
            name={saved.name}
            frameKey={saved.key}
            format={saved.format}
            canSetDefault={settings !== undefined}
            defaultSet={defaultSet}
            defaultBusy={defaults.busy}
            defaultError={defaults.error}
            onMakeDefault={() => void onMakeDefault()}
            onAnother={reset}
            onDone={onDone}
          />
        )}
      </div>
    </div>
  );
}

export default FrameProposer;
