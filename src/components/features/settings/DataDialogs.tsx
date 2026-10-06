"use client";

import { useState, type FormEvent } from "react";
import Drawer from "@/components/ui/Drawer";
import { DELETE_CONFIRM_TEXT, DELETE_WORD, DISCONNECT_CONFIRM_TEXT, confirmTextOk } from "@/lib/dataSettings";

/*
 * The two confirmations on Settings > Data & account. Both sit on the shared
 * modal Drawer, which is a native <dialog> (role dialog, focus kept inside,
 * Escape closes, a bottom sheet on a phone). The parent mounts one only while
 * it is open, so the typed text always starts empty.
 */

export function DisconnectDialog({
  busy,
  error,
  onConfirm,
  onClose,
}: {
  busy: boolean;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Drawer
      open
      onClose={onClose}
      title="Disconnect all accounts?"
      eyebrow="Data & account"
      footer={
        <div className="st-dialog-actions">
          <button type="button" className="sq-btn" autoFocus onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="sq-btn sq-btn-primary" disabled={busy} onClick={onConfirm}>
            {busy ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      }
    >
      <p className="st-dialog-text">{DISCONNECT_CONFIRM_TEXT}</p>
      {error && (
        <p className="st-error" role="alert">
          {error}
        </p>
      )}
    </Drawer>
  );
}

export function DeleteEverythingDialog({
  busy,
  error,
  onConfirm,
  onClose,
}: {
  busy: boolean;
  error: string;
  /** Called with the typed text, which is exactly DELETE. */
  onConfirm: (confirm: string) => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const ok = confirmTextOk(typed);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (ok && !busy) onConfirm(typed);
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="Delete everything?"
      eyebrow="Data & account"
      footer={
        <div className="st-dialog-actions">
          <button type="button" className="sq-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="st-delete-form"
            className="sq-btn st-btn-danger"
            disabled={!ok || busy}
            aria-describedby="st-delete-help"
          >
            {busy ? "Deleting…" : "Delete everything"}
          </button>
        </div>
      }
    >
      <form id="st-delete-form" className="st-dialog-form" onSubmit={submit}>
        <p className="st-dialog-text">{DELETE_CONFIRM_TEXT}</p>
        <label className="st-field-label" htmlFor="st-delete-confirm">
          Type {DELETE_WORD} to confirm
        </label>
        <input
          id="st-delete-confirm"
          className="sq-input"
          type="text"
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={typed}
          readOnly={busy}
          aria-describedby="st-delete-help"
          onChange={(e) => setTyped(e.target.value)}
        />
        <small id="st-delete-help" className="sq-muted">
          The button turns on when the box says {DELETE_WORD} exactly, in capitals.
        </small>
      </form>
      {error && (
        <p className="st-error" role="alert">
          {error}
        </p>
      )}
    </Drawer>
  );
}
