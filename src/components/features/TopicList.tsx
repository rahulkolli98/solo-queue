"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type Status = "drafting" | "ready" | "queued" | "done";

const STATUSES: Status[] = ["drafting", "ready", "queued", "done"];

function metaLine(status: Status, createdAt: number): string {
  const d = new Date(createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
  return `${status.toUpperCase()} · SAVED ${d.toUpperCase()}`;
}

function TopicRow({
  topic,
}: {
  topic: {
    _id: Id<"topics">;
    title: string;
    notes?: string;
    sourceUrl?: string;
    status: Status;
    createdAt: number;
  };
}) {
  const update = useMutation(api.topics.update);
  const remove = useMutation(api.topics.remove);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [title, setTitle] = useState(topic.title);
  const [notes, setNotes] = useState(topic.notes ?? "");
  const [sourceUrl, setSourceUrl] = useState(topic.sourceUrl ?? "");
  const [status, setStatus] = useState<Status>(topic.status);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim()) {
      setError("Title can't be empty.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await update({
        id: topic._id,
        title: title.trim(),
        notes,
        sourceUrl,
        status,
      });
      setEditing(false);
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save changes.");
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    setBusy(true);
    try {
      await remove({ id: topic._id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="sq-card">
        <div className="sq-card-h">
          <span className="t-body-strong">{topic.title}</span>
          <span className="sq-tag" style={{ marginLeft: "auto" }}>
            {topic.status}
          </span>
        </div>
        {topic.notes && <p className="sq-muted" style={{ margin: 0 }}>{topic.notes}</p>}
        <span className="t-meta" style={{ color: "var(--color-muted-on-surface)" }}>
          {metaLine(topic.status, topic.createdAt)}
          {topic.sourceUrl ? " · 1 SOURCE" : ""}
        </span>
        <div className="sq-row">
          <Link
            className="sq-btn sq-btn-primary"
            style={{ height: 36, fontSize: 13, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            href={`/studio/${topic._id}`}
          >
            Open in Studio
          </Link>
          <button
            className="sq-btn"
            style={{ height: 36, fontSize: 13 }}
            onClick={() => {
              setTitle(topic.title);
              setNotes(topic.notes ?? "");
              setSourceUrl(topic.sourceUrl ?? "");
              setStatus(topic.status);
              setError(null);
              setConfirming(false);
              setEditing(true);
            }}
          >
            Edit
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
              disabled={busy}
              onClick={destroy}
            >
              {busy ? "Deleting…" : "Confirm delete"}
            </button>
          )}
        </div>
        {error && (
          <div className="sq-error-box" role="alert">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="sq-card">
      <div className="sq-form-row">
        <label htmlFor={`edit-title-${topic._id}`}>Title</label>
        <input
          id={`edit-title-${topic._id}`}
          className="sq-field"
          style={{ width: "100%", maxWidth: 420 }}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
      </div>
      <div className="sq-form-row" style={{ marginTop: 8 }}>
        <label htmlFor={`edit-notes-${topic._id}`}>Notes</label>
        <textarea
          id={`edit-notes-${topic._id}`}
          className="sq-field"
          style={{ width: "100%", maxWidth: 420, height: 64, paddingTop: 10, resize: "vertical" }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
        />
      </div>
      <div className="sq-form-row" style={{ marginTop: 8 }}>
        <label htmlFor={`edit-url-${topic._id}`}>Source</label>
        <input
          id={`edit-url-${topic._id}`}
          className="sq-field"
          style={{ width: "100%", maxWidth: 420 }}
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          inputMode="url"
          maxLength={500}
        />
      </div>
      <div className="sq-form-row" style={{ marginTop: 8 }}>
        <label htmlFor={`edit-status-${topic._id}`}>Status</label>
        <select
          id={`edit-status-${topic._id}`}
          className="sq-field"
          style={{ width: 200 }}
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <div className="sq-error-box" role="alert">
          {error}
        </div>
      )}
      <div className="sq-row" style={{ marginTop: 8 }}>
        <button
          className="sq-btn sq-btn-primary"
          style={{ height: 36, fontSize: 13 }}
          disabled={busy}
          onClick={save}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          className="sq-btn"
          style={{ height: 36, fontSize: 13 }}
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function TopicList() {
  const topics = useQuery(api.topics.list);

  if (topics === undefined) {
    return <p className="sq-muted">Loading inbox…</p>;
  }
  if (topics.length === 0) {
    return (
      <div className="sq-card">
        <p className="sq-muted" style={{ margin: 0 }}>
          Inbox is empty. Capture the first topic above — research once, and
          Studio turns it into both platforms.
        </p>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {topics.map((t) => (
        <TopicRow key={t._id} topic={t} />
      ))}
    </div>
  );
}
