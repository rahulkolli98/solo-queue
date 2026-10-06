"use client";

import { useAction, useQuery } from "convex/react";
import { useState, type KeyboardEvent } from "react";
import { api } from "../../../../convex/_generated/api";
import { refusalText } from "@/lib/refusalText";
import {
  SIGN_OFF_MAX,
  VOICE_DESCRIPTION_MAX,
  addBannedWord,
  frameOptions,
  igHashtagOptions,
  learnedFromText,
  mergeVoice,
  removeBannedWord,
  validateDescription,
  validateSignOff,
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

  const [running, setRunning] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [retrainError, setRetrainError] = useState("");

  if (!voice) return <p className="sq-muted">Loading voice settings…</p>;

  const description = descDraft ?? voice.description;
  const signOff = signOffDraft ?? voice.signOff ?? "";
  const options = frameOptions(frames, voice.defaultFrameKey);

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
              <label htmlFor="voice-frame">Default story frame</label>
              <small>Used when you don&apos;t pick one.</small>
            </div>
            <select
              id="voice-frame"
              className="sq-input st-select"
              value={voice.defaultFrameKey}
              onChange={(e) => changeSelect({ defaultFrameKey: e.target.value })}
            >
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
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
