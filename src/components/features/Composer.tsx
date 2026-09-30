"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type Draft = FunctionReturnType<typeof api.drafts.listByTopic>[number];

type TabKey = "threads" | "caption" | "reel" | "blog";

const TABS: {
  key: TabKey;
  label: string;
  templateKey: string;
  platform: string;
  limit: number | null;
  mediaRequired?: boolean;
  hint: string;
}[] = [
  {
    key: "threads",
    label: "Threads",
    templateKey: "threads-hook-story",
    platform: "threads",
    limit: 500,
    hint: "2 posts, 500 chars each. Over-limit blocks queue.",
  },
  {
    key: "caption",
    label: "IG caption",
    templateKey: "ig-caption-beats",
    platform: "instagram",
    limit: 2200,
    mediaRequired: true,
    hint: "2200 chars max. Needs a photo or video before queue.",
  },
  {
    key: "reel",
    label: "IG reel",
    templateKey: "reel-script",
    platform: "instagram",
    limit: null,
    mediaRequired: true,
    hint: "Script + shot list. Needs footage before queue.",
  },
  {
    key: "blog",
    label: "Blog",
    templateKey: "blog-draft",
    platform: "blog",
    limit: null,
    hint: "Long-form home for the idea. No hard limit.",
  },
];

/** Emoji-aware length — counts grapheme-ish code points, not UTF-16 units. */
function charLen(s: string): number {
  return Array.from(s).length;
}

function threadsPosts(body: string): string[] {
  return body
    .split(/\n---\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export default function Composer({ topicId }: { topicId: string }) {
  const id = topicId as Id<"topics">;
  const topic = useQuery(api.topics.get, { id });
  const drafts = useQuery(api.drafts.listByTopic, { topicId: id });
  const generate = useAction(api.drafting.generate);
  const saveDraft = useMutation(api.drafts.update);

  const [active, setActive] = useState<TabKey>("threads");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline edits, keyed by draft id. Displayed body = edit ?? server body.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [savedAt, setSavedAt] = useState<Record<string, number>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef<Record<string, string>>({});
  const saveRef = useRef(saveDraft);
  saveRef.current = saveDraft;

  async function flushSave(draftId: string): Promise<void> {
    const body = pending.current[draftId];
    if (body === undefined) return;
    delete pending.current[draftId];
    const timer = timers.current[draftId];
    if (timer) {
      clearTimeout(timer);
      delete timers.current[draftId];
    }
    setSaving((s) => ({ ...s, [draftId]: true }));
    setSaveError(null);
    try {
      await saveRef.current({ id: draftId as Id<"drafts">, body });
      setEdits((prev) =>
        prev[draftId] === body
          ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== draftId))
          : prev
      );
      setSavedAt((s) => ({ ...s, [draftId]: Date.now() }));
    } catch (err) {
      // Keep the edit locally and re-stage it so nothing is lost.
      pending.current[draftId] = body;
      setSaveError(err instanceof Error ? err.message : "Couldn't save edits.");
    } finally {
      setSaving((s) => ({ ...s, [draftId]: false }));
    }
  }

  function scheduleSave(draftId: string, body: string) {
    pending.current[draftId] = body;
    const old = timers.current[draftId];
    if (old) clearTimeout(old);
    timers.current[draftId] = setTimeout(() => void flushSave(draftId), 800);
  }

  async function flushAll(): Promise<void> {
    await Promise.all(Object.keys(pending.current).map((d) => flushSave(d)));
  }

  // Flush unsaved edits when the tab closes/navigates — best effort.
  useEffect(() => {
    function onUnload() {
      for (const [draftId, body] of Object.entries(pending.current)) {
        try {
          void saveRef.current({ id: draftId as Id<"drafts">, body });
        } catch {
          // Unload path: nothing left to do.
        }
      }
    }
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      void flushAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byTab = useMemo(() => {
    const map = new Map<TabKey, Draft[]>();
    if (!drafts) return map;
    for (const tab of TABS) {
      map.set(
        tab.key,
        drafts.filter(
          (d) => d.templateKey === tab.templateKey || (d.templateKey === "" && d.platform === tab.platform)
        )
      );
    }
    return map;
  }, [drafts]);

  async function onGenerate() {
    setBusy(true);
    setError(null);
    try {
      await flushAll();
      await generate({ topicId: id });
      // Fresh server bodies win — drop any lingering local edits.
      setEdits({});
      pending.current = {};
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  function switchTab(key: TabKey) {
    if (key !== active) void flushAll();
    setActive(key);
  }

  if (topic === undefined || drafts === undefined) {
    return <p className="sq-muted">Loading composer…</p>;
  }
  if (topic === null) {
    return (
      <div className="sq-error-box" role="alert">
        Topic not found. It may have been deleted — head back to Research.
      </div>
    );
  }

  const tab = TABS.find((t) => t.key === active)!;
  const tabDrafts = byTab.get(active) ?? [];
  const latest = tabDrafts.length > 0 ? tabDrafts[tabDrafts.length - 1] : null;
  // Live badges read the edited text when present, so counts move as you type.
  const shownBody = latest ? (edits[latest._id] ?? latest.body) : "";
  const posts = latest && active === "threads" ? threadsPosts(shownBody) : [];
  const overBy =
    latest && tab.limit !== null && active === "threads"
      ? Math.max(0, ...posts.map((p) => charLen(p) - tab.limit!))
      : latest && tab.limit !== null
        ? Math.max(0, charLen(shownBody) - tab.limit)
        : 0;
  const hasDrafts = (byTab.get("threads") ?? []).length > 0;
  const edited = latest ? edits[latest._id] !== undefined : false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <section className="sq-card" aria-label="Topic">
        <div className="sq-card-h">
          <span className="t-body-strong">{topic.title}</span>
          <span className="sq-tag" style={{ marginLeft: "auto" }}>
            {topic.status}
          </span>
        </div>
        {topic.notes && <p className="sq-muted" style={{ margin: 0 }}>{topic.notes}</p>}
        <div className="sq-row" style={{ marginTop: 8 }}>
          <button
            className="sq-btn sq-btn-primary"
            disabled={busy}
            onClick={onGenerate}
          >
            {busy ? "Drafting…" : hasDrafts ? "Regenerate drafts" : "Generate drafts"}
          </button>
          {busy && (
            <span className="sq-muted" aria-live="polite">
              Asking the model — drafts land tab by tab.
            </span>
          )}
        </div>
        {error && (
          <div className="sq-error-box" role="alert" style={{ marginTop: 8 }}>
            {error}
          </div>
        )}
      </section>

      <div className="sq-row" role="tablist" aria-label="Draft formats">
        {TABS.map((t) => {
          const count = (byTab.get(t.key) ?? []).length;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active === t.key}
              className="sq-btn"
              style={
                active === t.key
                  ? { borderColor: "var(--color-ink)", fontWeight: 700 }
                  : undefined
              }
              onClick={() => switchTab(t.key)}
            >
              {t.label}
              {count > 0 ? ` · ${count}` : ""}
            </button>
          );
        })}
      </div>

      <section className="sq-card" aria-label={`${tab.label} draft`}>
        <div className="sq-card-h">
          <h2 className="sq-card-title">{tab.label}</h2>
          {latest && (
            <span className="sq-tag" style={{ marginLeft: "auto" }}>
              v{latest.templateVersion} · {overBy > 0 ? "OVER LIMIT" : "WITHIN LIMIT"}
              {edited ? " · EDITED" : ""}
            </span>
          )}
        </div>
        <p className="sq-muted" style={{ marginTop: 0 }}>{tab.hint}</p>

        {!latest && (
          <p className="sq-muted" style={{ margin: 0 }}>
            No {tab.label.toLowerCase()} draft yet — hit{" "}
            {hasDrafts ? "Regenerate" : "Generate"} above.
          </p>
        )}

        {latest && (
          <div className="sq-form-row">
            <label htmlFor={`draft-edit-${latest._id}`}>
              Edit {tab.label.toLowerCase()} draft
            </label>
            <textarea
              id={`draft-edit-${latest._id}`}
              className="sq-field"
              style={{ width: "100%", minHeight: active === "threads" ? 160 : 120, paddingTop: 10, resize: "vertical" }}
              value={shownBody}
              maxLength={20000}
              onChange={(e) => {
                const body = e.target.value;
                setEdits((prev) => ({ ...prev, [latest._id]: body }));
                setSaveError(null);
                scheduleSave(latest._id, body);
              }}
            />
            <span className="t-meta" style={{ color: "var(--color-muted-on-surface)" }} aria-live="polite">
              {saving[latest._id]
                ? "SAVING…"
                : edited
                  ? "UNSAVED CHANGES…"
                  : savedAt[latest._id]
                    ? `SAVED ${new Date(savedAt[latest._id]).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }).toUpperCase()}`
                    : "NO UNSAVED CHANGES"}
            </span>
          </div>
        )}
        {saveError && (
          <div className="sq-error-box" role="alert">
            {saveError}{" "}
            <button
              className="sq-btn"
              style={{ height: 32, fontSize: 12, marginLeft: 8 }}
              onClick={() => latest && void flushSave(latest._id)}
            >
              Retry save
            </button>
          </div>
        )}

        {latest && active === "threads" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {posts.map((p, i) => {
              const n = charLen(p);
              const over = n - 500;
              return (
                <div key={i}>
                  <span className="t-meta" style={{ color: "var(--color-muted-on-surface)" }}>
                    POST {i + 1} · {n} / 500{over > 0 ? ` · OVER BY ${over}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {latest && active !== "threads" && (
          <div style={{ marginTop: 8 }}>
            <span className="t-meta" style={{ color: "var(--color-muted-on-surface)" }}>
              {charLen(shownBody)} CHARS
              {tab.limit !== null ? ` / ${tab.limit}` : ""}
              {overBy > 0 ? ` · OVER BY ${overBy}` : ""}
            </span>
          </div>
        )}

        {tab.mediaRequired && (
          <p className="sq-muted" style={{ marginBottom: 0 }}>
            Media required before queue — attach a photo or video in the
            media library (Phase 2, TASK-021).
          </p>
        )}

        <div className="sq-row" style={{ marginTop: 8 }}>
          <button
            className="sq-btn"
            disabled
            title={
              !latest
                ? "Generate a draft first"
                : overBy > 0
                  ? `Shorten by ${overBy} chars to queue`
                  : "Queueing wires up in Phase 3"
            }
          >
            {!latest
              ? "Queue"
              : overBy > 0
                ? `Over by ${overBy} chars`
                : "Queue (Phase 3)"}
          </button>
        </div>
      </section>
    </div>
  );
}
