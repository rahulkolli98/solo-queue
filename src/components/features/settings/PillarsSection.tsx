"use client";

import { useState, type CSSProperties, type KeyboardEvent } from "react";
import type { Pillar } from "../../../../convex/lib/settingsModel";
import {
  PILLAR_DESCRIPTION_MAX,
  PILLAR_NAME_MAX,
  addPillarLink,
  clampShare,
  mergePillar,
  mixLabel,
  mixSegments,
  pillarColorVar,
  removePillarLink,
  shareTotal,
  shareTotalWarning,
  validatePillarDescription,
  validatePillarName,
} from "@/lib/settingsEdit";
import { statusText, useSectionSave, type SaveResult } from "./useSectionSave";

type PillarChange = Partial<Omit<Pillar, "key">>;

/**
 * Board 06e: the four content pillars and the target mix. There is no add or
 * remove (there are only four pillar colours). Every change saves at once,
 * sending the whole `pillars` array; a share total other than 100 only warns.
 */
export default function PillarsSection() {
  const { section: pillars, status, message, save } = useSectionSave("pillars");

  if (!pillars) return <p className="sq-muted">Loading content pillars…</p>;

  const segments = mixSegments(pillars);
  const total = shareTotal(pillars);
  const warning = shareTotalWarning(total);

  function change(key: string, patch: PillarChange | ((current: Pillar) => PillarChange)): Promise<SaveResult> {
    return save((cur) =>
      mergePillar(cur, key, typeof patch === "function" ? patch(cur.find((p) => p.key === key) as Pillar) : patch)
    );
  }

  return (
    <div className="st-stack">
      <p className="st-save-status sq-muted" role="status" aria-live="polite" data-state={status}>
        {statusText(status, message)}
      </p>

      <section className="sq-card" aria-label="Target mix">
        <div className="st-card-head">
          <h3 className="st-eyebrow">Target mix</h3>
          <span className="st-mono st-total">Total {total}%</span>
        </div>
        <div className="st-mix" role="img" aria-label={mixLabel(pillars)}>
          {segments
            .filter((s) => s.widthPct > 0)
            .map((s) => (
              <div
                key={s.key}
                className="st-mix-seg"
                title={`${s.name} ${s.share}%`}
                style={{ "--st-seg-width": `${s.widthPct}%`, "--st-pillar": pillarColorVar(s.color) } as CSSProperties}
              />
            ))}
        </div>
        <ul className="st-legend">
          {segments.map((s) => (
            <li key={s.key} className="st-legend-item">
              <span
                className="st-swatch"
                aria-hidden="true"
                style={{ "--st-pillar": pillarColorVar(s.color) } as CSSProperties}
              />
              <span>{s.name}</span>
              <span className="st-mono">{s.share}%</span>
            </li>
          ))}
        </ul>
        {warning && (
          <p className="st-warn" data-testid="share-warning">
            {warning}
          </p>
        )}
      </section>

      <div className="st-pillars">
        {pillars.map((p) => (
          <PillarCard key={p.key} pillar={p} onChange={(patch) => change(p.key, patch)} />
        ))}
      </div>
    </div>
  );
}

function PillarCard({
  pillar,
  onChange,
}: {
  pillar: Pillar;
  onChange: (patch: PillarChange | ((current: Pillar) => PillarChange)) => Promise<SaveResult>;
}) {
  const id = `pillar-${pillar.key}`;
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [descDraft, setDescDraft] = useState<string | null>(null);
  const [shareDraft, setShareDraft] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState("");
  const [error, setError] = useState("");

  const name = nameDraft ?? pillar.name;
  const description = descDraft ?? pillar.description;
  const share = shareDraft ?? String(pillar.targetShare);

  async function commitName() {
    if (nameDraft === null) return;
    const checked = validatePillarName(nameDraft);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    if (checked.value === pillar.name) {
      setNameDraft(null);
      setError("");
      return;
    }
    setError("");
    const result = await onChange({ name: checked.value });
    if (result.ok) setNameDraft(null);
    else setError(result.message);
  }

  async function commitDescription() {
    if (descDraft === null) return;
    const checked = validatePillarDescription(descDraft);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    if (checked.value === pillar.description) {
      setDescDraft(null);
      setError("");
      return;
    }
    setError("");
    const result = await onChange({ description: checked.value });
    if (result.ok) setDescDraft(null);
    else setError(result.message);
  }

  async function commitShare() {
    if (shareDraft === null) return;
    const clamped = clampShare(shareDraft);
    if (clamped === null) {
      setError("Enter a whole number from 0 to 100.");
      return;
    }
    if (clamped === pillar.targetShare) {
      setShareDraft(null);
      setError("");
      return;
    }
    setError("");
    const result = await onChange({ targetShare: clamped });
    if (result.ok) setShareDraft(null);
    else setError(result.message);
  }

  async function addLink() {
    const added = addPillarLink(pillar.links, linkDraft);
    if (!added.ok) {
      setError(added.message);
      return;
    }
    setError("");
    const result = await onChange((cur) => {
      const again = addPillarLink(cur.links, linkDraft);
      return { links: again.ok ? again.value : cur.links };
    });
    if (result.ok) setLinkDraft("");
    else setError(result.message);
  }

  async function removeLink(link: string) {
    setError("");
    const result = await onChange((cur) => ({ links: removePillarLink(cur.links, link) }));
    if (!result.ok) setError(result.message);
  }

  const enter = (commit: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  };

  return (
    <section
      className="sq-card st-pillar"
      aria-label={pillar.name}
      style={{ "--st-pillar": pillarColorVar(pillar.color) } as CSSProperties}
    >
      <div className="st-pillar-head">
        <span className="st-swatch st-swatch-lg" aria-hidden="true" />
        <div className="st-pillar-name">
          <label className="st-field-label" htmlFor={`${id}-name`}>
            Name
          </label>
          <input
            id={`${id}-name`}
            className="sq-input"
            type="text"
            maxLength={PILLAR_NAME_MAX}
            value={name}
            autoComplete="off"
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={enter(commitName)}
          />
        </div>
        <div className="st-pillar-share">
          <label className="st-field-label" htmlFor={`${id}-share`}>
            Target %
          </label>
          <input
            id={`${id}-share`}
            className="sq-input st-share"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            value={share}
            onChange={(e) => setShareDraft(e.target.value)}
            onBlur={commitShare}
            onKeyDown={enter(commitShare)}
          />
        </div>
      </div>

      <label className="st-field-label" htmlFor={`${id}-desc`}>
        Description
      </label>
      <textarea
        id={`${id}-desc`}
        className="sq-input st-textarea"
        rows={2}
        maxLength={PILLAR_DESCRIPTION_MAX}
        value={description}
        onChange={(e) => setDescDraft(e.target.value)}
        onBlur={commitDescription}
      />
      <span className="st-mono st-count">
        {description.length}/{PILLAR_DESCRIPTION_MAX}
      </span>

      <span className="st-field-label" id={`${id}-links`}>
        Linked products
      </span>
      {pillar.links.length === 0 ? (
        <p className="sq-muted st-none">No linked product.</p>
      ) : (
        <ul className="st-chips" aria-labelledby={`${id}-links`}>
          {pillar.links.map((l) => (
            <li key={l} className="st-chip">
              <span>{l}</span>
              <button type="button" className="st-chip-x" aria-label={`Unlink ${l}`} onClick={() => removeLink(l)}>
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="st-add-row">
        <label className="sq-sr" htmlFor={`${id}-link`}>
          Link a product to {pillar.name}
        </label>
        <input
          id={`${id}-link`}
          className="sq-input"
          type="text"
          value={linkDraft}
          maxLength={80}
          placeholder="Link a product"
          autoComplete="off"
          onChange={(e) => {
            setLinkDraft(e.target.value);
            setError("");
          }}
          onKeyDown={enter(addLink)}
        />
        <button type="button" className="sq-btn sq-btn-sm" onClick={addLink}>
          Add
        </button>
      </div>

      {error && (
        <p className="st-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
