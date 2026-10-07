"use client";

import { useAction, useQuery } from "convex/react";
import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { api } from "../../../../convex/_generated/api";
import type { SetupKind } from "../../../../convex/lib/formatSetup";
import { refusalText } from "@/lib/refusalText";
import {
  ABOUT_ME_MAX,
  SIGN_OFF_MAX,
  STYLE_GUIDE_MAX,
  VOICE_DESCRIPTION_MAX,
  addBannedWord,
  CAROUSEL_SLIDE_CHOICES,
  THREAD_POST_CHOICES,
  checkStyleGuideFile,
  formatDefaultChange,
  formatDefaultRows,
  igHashtagOptions,
  learnedFromText,
  mergeVoice,
  removeBannedWord,
  validateAboutMe,
  validateDescription,
  validateSignOff,
  validateStyleGuide,
} from "@/lib/settingsEdit";
import { statusText, useSectionSave } from "./useSectionSave";

interface Suggestion {
  description: string;
  basedOn: number;
}

/**
 * Board 06d: how drafts should sound. Every control saves as it changes
 * (selects and chips at once; the text fields when you leave them, and Enter
 * in the single-line ones). Each save sends the whole `voice` object.
 */
export default function VoiceSection() {
  const { section: voice, status, message, save } = useSectionSave("voice");
  const frames = useQuery(api.frames.list);
  const suggest = useAction(api.voice.suggest);

  const [descDraft, setDescDraft] = useState<string | null>(null);
  const [descError, setDescError] = useState("");
  const [signOffDraft, setSignOffDraft] = useState<string | null>(null);
  const [signOffError, setSignOffError] = useState("");
  const [wordDraft, setWordDraft] = useState("");
  const [wordError, setWordError] = useState("");
  const [selectError, setSelectError] = useState("");
  const [aboutDraft, setAboutDraft] = useState<string | null>(null);
  const [aboutError, setAboutError] = useState("");
  const [guideDraft, setGuideDraft] = useState<string | null>(null);
  const [guideError, setGuideError] = useState("");
  const [guideNote, setGuideNote] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const [running, setRunning] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [retrainError, setRetrainError] = useState("");

  if (!voice) return <p className="sq-muted">Loading voice settings…</p>;

  const description = descDraft ?? voice.description;
  const signOff = signOffDraft ?? voice.signOff ?? "";
  const aboutMe = aboutDraft ?? voice.aboutMe ?? "";
  const styleGuide = guideDraft ?? voice.styleGuide ?? "";
  const guideUnsaved = guideDraft !== null && guideDraft.trim() !== (voice.styleGuide ?? "");
  const formatRows = formatDefaultRows(voice, frames);

  async function commitDescription() {
    if (descDraft === null || !voice || descDraft === voice.description) {
      setDescDraft(null);
      return;
    }
    const problem = validateDescription(descDraft);
    if (problem) {
      setDescError(problem);
      return;
    }
    setDescError("");
    const result = await save((cur) => mergeVoice(cur, { description: descDraft }));
    if (result.ok) setDescDraft(null);
    else setDescError(result.message);
  }

  async function commitSignOff() {
    if (signOffDraft === null || !voice || signOffDraft.trim() === (voice.signOff ?? "")) {
      setSignOffDraft(null);
      setSignOffError("");
      return;
    }
    const problem = validateSignOff(signOffDraft);
    if (problem) {
      setSignOffError(problem);
      return;
    }
    setSignOffError("");
    const result = await save((cur) => mergeVoice(cur, { signOff: signOffDraft }));
    if (result.ok) setSignOffDraft(null);
    else setSignOffError(result.message);
  }

  async function changeSelect(change: Parameters<typeof mergeVoice>[1]) {
    setSelectError("");
    const result = await save((cur) => mergeVoice(cur, change));
    if (!result.ok) setSelectError(result.message);
  }

  async function changeFormat(kind: SetupKind, change: Parameters<typeof formatDefaultChange>[2]) {
    setSelectError("");
    const result = await save((cur) => mergeVoice(cur, formatDefaultChange(cur, kind, change)));
    if (!result.ok) setSelectError(result.message);
  }

  async function addWord() {
    if (!voice) return;
    const added = addBannedWord(voice.bannedWords, wordDraft);
    if (!added.ok) {
      setWordError(added.message);
      return;
    }
    setWordError("");
    const result = await save((cur) => {
      // Re-check against the latest list so two quick adds both land.
      const again = addBannedWord(cur.bannedWords, wordDraft);
      return again.ok ? mergeVoice(cur, { bannedWords: again.value }) : cur;
    });
    if (result.ok) setWordDraft("");
    else setWordError(result.message);
  }

  async function removeWord(word: string) {
    setWordError("");
    const result = await save((cur) => mergeVoice(cur, { bannedWords: removeBannedWord(cur.bannedWords, word) }));
    if (!result.ok) setWordError(result.message);
  }

  async function retrain() {
    setRunning(true);
    setRetrainError("");
    setSuggestion(null);
    try {
      const result = await suggest({});
      setSuggestion({ description: result.description, basedOn: result.basedOn });
    } catch (err) {
      setRetrainError(refusalText(err, "Couldn't read your posts. Try again."));
    } finally {
      setRunning(false);
    }
  }

  async function useSuggestion() {
    if (!suggestion) return;
    const picked = suggestion;
    const result = await save((cur) =>
      mergeVoice(cur, { description: picked.description, learnedFromCount: picked.basedOn })
    );
    if (result.ok) {
      setSuggestion(null);
      setDescDraft(null);
      setDescError("");
    } else {
      setRetrainError(result.message);
    }
  }

  async function commitAbout() {
    if (aboutDraft === null || !voice || aboutDraft.trim() === (voice.aboutMe ?? "")) {
      setAboutDraft(null);
      setAboutError("");
      return;
    }
    const problem = validateAboutMe(aboutDraft);
    if (problem) {
      setAboutError(problem);
      return;
    }
    setAboutError("");
    const result = await save((cur) => mergeVoice(cur, { aboutMe: aboutDraft }));
    if (result.ok) setAboutDraft(null);
    else setAboutError(result.message);
  }

  async function commitGuide() {
    if (guideDraft === null || !voice || guideDraft.trim() === (voice.styleGuide ?? "")) {
      setGuideDraft(null);
      setGuideError("");
      return;
    }
    const problem = validateStyleGuide(guideDraft);
    if (problem) {
      setGuideError(problem);
      return;
    }
    setGuideError("");
    const result = await save((cur) => mergeVoice(cur, { styleGuide: guideDraft }));
    if (result.ok) {
      setGuideDraft(null);
      setGuideNote("");
    } else setGuideError(result.message);
  }

  async function clearGuide() {
    setGuideError("");
    setGuideNote("");
    const result = await save((cur) => mergeVoice(cur, { styleGuide: "" }));
    if (result.ok) setGuideDraft(null);
    else setGuideError(result.message);
  }

  /** Reads the file in the browser and puts its text in the box to review; nothing is saved until you leave the box or press Save. */
  async function loadGuideFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const refused = checkStyleGuideFile(file);
    if (refused) {
      setGuideError(refused);
      return;
    }
    try {
      const text = await file.text();
      setGuideDraft(text);
      setGuideError(validateStyleGuide(text) ?? "");
      setGuideNote(`Loaded ${file.name}. Read it through, then save.`);
    } catch {
      setGuideError("Couldn't read that file. Try another.");
    }
  }

  const enterToCommit = (commit: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  };

  return (
    <div className="st-stack">
      <p className="st-save-status sq-muted" role="status" aria-live="polite" data-state={status}>
        {statusText(status, message)}
      </p>

      <div className="st-voice-grid">
        <section className="sq-card st-voice-card" aria-label="Your voice">
          <div className="st-card-head">
            <h3 className="st-eyebrow">Your voice</h3>
            <span className="st-mono">{learnedFromText(voice.learnedFromCount)}</span>
          </div>
          <label className="st-field-label" htmlFor="voice-description">
            Voice description
          </label>
          <textarea
            id="voice-description"
            className="sq-input st-textarea"
            rows={4}
            maxLength={VOICE_DESCRIPTION_MAX}
            value={description}
            aria-invalid={descError ? true : undefined}
            aria-describedby="voice-description-count"
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={commitDescription}
          />
          <div className="st-count-row">
            <span id="voice-description-count" className="st-mono">
              {description.length}/{VOICE_DESCRIPTION_MAX}
            </span>
            {descError && (
              <span className="sq-formfield-error" role="alert">
                {descError}
              </span>
            )}
          </div>
          <div className="sq-row">
            <button type="button" className="sq-btn sq-btn-sm st-retrain" onClick={retrain} disabled={running}>
              {running ? "Reading your published posts…" : "Retrain from my published posts"}
            </button>
          </div>
          <p className="st-live" role="status" aria-live="polite">
            {running ? "Reading your published posts and writing a suggestion. Nothing is saved yet." : ""}
          </p>
          {retrainError && (
            <p className="st-error" role="alert">
              {retrainError}
            </p>
          )}
          {suggestion && (
            <div className="st-suggestion" role="group" aria-label="Suggested voice description">
              <span className="st-mono">
                Suggested from {suggestion.basedOn} published {suggestion.basedOn === 1 ? "post" : "posts"}
              </span>
              <p className="st-suggestion-text">{suggestion.description}</p>
              <p className="sq-muted st-suggestion-note">Not saved yet. Your current description stays until you choose.</p>
              <div className="sq-row">
                <button type="button" className="sq-btn sq-btn-sm sq-btn-primary" onClick={useSuggestion}>
                  Use this
                </button>
                <button type="button" className="sq-btn sq-btn-sm" onClick={() => setSuggestion(null)}>
                  Keep mine
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="sq-card st-rows" aria-label="Writing defaults">
          <div className="st-setting">
            <div className="st-setting-text">
              <label htmlFor="voice-hashtags">Instagram hashtags</label>
              <small>Maximum per caption.</small>
            </div>
            <select
              id="voice-hashtags"
              className="sq-input st-select"
              value={String(voice.igHashtagMax)}
              onChange={(e) => changeSelect({ igHashtagMax: Number(e.target.value) })}
            >
              {igHashtagOptions(voice.igHashtagMax).map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="st-setting">
            <div className="st-setting-text">
              <label htmlFor="voice-signoff">Sign-off</label>
              <small>Added to the last post of a thread. Leave empty for none.</small>
            </div>
            <input
              id="voice-signoff"
              className="sq-input st-signoff"
              type="text"
              maxLength={SIGN_OFF_MAX}
              value={signOff}
              placeholder="Follow the build →"
              autoComplete="off"
              aria-invalid={signOffError ? true : undefined}
              onChange={(e) => setSignOffDraft(e.target.value)}
              onBlur={commitSignOff}
              onKeyDown={enterToCommit(commitSignOff)}
            />
          </div>
          {signOffError && (
            <p className="st-error" role="alert">
              {signOffError}
            </p>
          )}
          {selectError && (
            <p className="st-error" role="alert">
              {selectError}
            </p>
          )}
        </section>

      </div>

      <section className="sq-card st-formats" aria-label="Defaults by format">
        <div className="st-card-head">
          <h3 className="st-eyebrow">Defaults by format</h3>
          <span className="st-mono">Used when you don&apos;t choose</span>
        </div>
        <p className="sq-muted st-hint">
          Optional. Studio and the Library start from these; you can still change them for any one run.
        </p>
        <div className="st-fmt-list">
          {formatRows.map((row) => (
            <div key={row.kind} className="st-fmt" role="group" aria-label={`${row.label} defaults`}>
              <span className="st-fmt-name">{row.label}</span>
              <label className="st-fmt-check" htmlFor={`fmt-${row.kind}-include`}>
                <input
                  id={`fmt-${row.kind}-include`}
                  type="checkbox"
                  checked={row.include}
                  onChange={(e) => changeFormat(row.kind, { include: e.target.checked })}
                />
                <span>Include by default</span>
              </label>
              {row.takesFrame ? (
                <select
                  id={`fmt-${row.kind}-frame`}
                  className="sq-input st-select st-fmt-frame"
                  aria-label={`${row.label} story frame`}
                  value={row.frameKey}
                  disabled={row.frames.length === 0}
                  onChange={(e) => changeFormat(row.kind, { frameKey: e.target.value })}
                >
                  {row.frames.length === 0 && <option value="">No story frames</option>}
                  {row.frames.length > 0 && row.frameKey === "" && (
                    <option value="" disabled>
                      Choose a story frame
                    </option>
                  )}
                  {row.frames.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="sq-muted st-fmt-none">No story frame</span>
              )}
              {row.takesCount && row.kind === "carousel" && (
                <select
                  id={`fmt-${row.kind}-count`}
                  className="sq-input st-select st-fmt-count"
                  aria-label="Carousel slides"
                  value={String(row.count)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    changeFormat(row.kind, { count: n >= 1 ? n : null });
                  }}
                >
                  <option value="0">6 slides (default)</option>
                  {CAROUSEL_SLIDE_CHOICES.map((n) => (
                    <option key={n} value={String(n)}>
                      {n === 1 ? "1 slide (single statement)" : `${n} slides`}
                    </option>
                  ))}
                </select>
              )}
              {row.takesCount && row.kind === "threads" && (
                <select
                  id={`fmt-${row.kind}-count`}
                  className="sq-input st-select st-fmt-count"
                  aria-label="Threads posts"
                  value={String(row.count)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    changeFormat(row.kind, { count: n >= 2 ? n : null });
                  }}
                >
                  <option value="0">Follow the story frame</option>
                  {THREAD_POST_CHOICES.map((n) => (
                    <option key={n} value={String(n)}>
                      {n} posts
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="sq-card st-context" aria-label="About you and style guide">
        <div className="st-card-head">
          <h3 className="st-eyebrow">About you and your style</h3>
          <span className="st-mono">Sent with every draft</span>
        </div>
        <p className="sq-muted">Optional. Drafts work without either; they just sound more like you with them.</p>

        <label className="st-field-label" htmlFor="voice-about">
          About you
        </label>
        <textarea
          id="voice-about"
          className="sq-input st-textarea"
          rows={4}
          maxLength={ABOUT_ME_MAX}
          value={aboutMe}
          placeholder="Who you are, what you build, who you write for."
          aria-invalid={aboutError ? true : undefined}
          aria-describedby="voice-about-count"
          onChange={(e) => setAboutDraft(e.target.value)}
          onBlur={commitAbout}
        />
        <div className="st-count-row">
          <span id="voice-about-count" className="st-mono">
            {aboutMe.length}/{ABOUT_ME_MAX}
          </span>
          {aboutError && (
            <span className="sq-formfield-error" role="alert">
              {aboutError}
            </span>
          )}
        </div>

        <label className="st-field-label" htmlFor="voice-guide">
          Style guide
        </label>
        <small className="sq-muted">How you like to write: hooks, rhythm, tone, what to avoid. Paste it or load a .md or .txt file.</small>
        <textarea
          id="voice-guide"
          className="sq-input st-textarea st-guide"
          rows={10}
          value={styleGuide}
          placeholder="Paste a style guide here."
          aria-invalid={guideError ? true : undefined}
          aria-describedby="voice-guide-count"
          onChange={(e) => {
            setGuideDraft(e.target.value);
            setGuideNote("");
            setGuideError(validateStyleGuide(e.target.value) ?? "");
          }}
          onBlur={commitGuide}
        />
        <div className="st-count-row">
          <span id="voice-guide-count" className="st-mono">
            {styleGuide.trim().length.toLocaleString("en-US")}/{STYLE_GUIDE_MAX.toLocaleString("en-US")}
          </span>
          {guideNote && !guideError && <span className="sq-muted">{guideNote}</span>}
          {guideError && (
            <span className="sq-formfield-error" role="alert">
              {guideError}
            </span>
          )}
        </div>
        <div className="sq-row">
          <button type="button" className="sq-btn sq-btn-sm" onClick={() => fileInput.current?.click()}>
            Load from file
          </button>
          <input
            ref={fileInput}
            className="sq-sr"
            type="file"
            tabIndex={-1}
            aria-label="Style guide file (.md or .txt)"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            onChange={loadGuideFile}
          />
          {guideUnsaved && (
            <button
              type="button"
              className="sq-btn sq-btn-sm sq-btn-primary"
              onClick={commitGuide}
              disabled={Boolean(validateStyleGuide(styleGuide))}
            >
              Save style guide
            </button>
          )}
          {(voice.styleGuide || guideDraft) && (
            <button type="button" className="sq-btn sq-btn-sm" onClick={clearGuide}>
              Clear
            </button>
          )}
        </div>
      </section>

      <section className="sq-card" aria-label="Never use these words">
        <div className="st-card-head">
          <h3 className="st-eyebrow">Never use these words</h3>
          <span className="st-mono">{voice.bannedWords.length}/50</span>
        </div>
        {voice.bannedWords.length === 0 ? (
          <p className="sq-muted">Nothing banned yet.</p>
        ) : (
          <ul className="st-chips" aria-label="Banned words">
            {voice.bannedWords.map((w) => (
              <li key={w} className="st-chip">
                <span>{w}</span>
                <button type="button" className="st-chip-x" aria-label={`Remove ${w}`} onClick={() => removeWord(w)}>
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="st-add-row">
          <label className="sq-sr" htmlFor="voice-word">
            Add a word or phrase to never use
          </label>
          <input
            id="voice-word"
            className="sq-input"
            type="text"
            value={wordDraft}
            maxLength={80}
            placeholder="Add a word or phrase"
            autoComplete="off"
            aria-invalid={wordError ? true : undefined}
            onChange={(e) => {
              setWordDraft(e.target.value);
              setWordError("");
            }}
            onKeyDown={enterToCommit(addWord)}
          />
          <button type="button" className="sq-btn sq-btn-sm" onClick={addWord}>
            Add
          </button>
        </div>
        {wordError && (
          <p className="st-error" role="alert">
            {wordError}
          </p>
        )}
      </section>
    </div>
  );
}
