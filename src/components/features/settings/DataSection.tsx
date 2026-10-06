"use client";

import { useAction, useConvex, useMutation } from "convex/react";
import { useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import {
  deleteSummary,
  disconnectedText,
  downloadFilename,
  exportBlob,
  localDateKey,
  triggerDownload,
  type ExportKind,
} from "@/lib/dataSettings";
import { refusalText } from "@/lib/refusalText";
import { DeleteEverythingDialog, DisconnectDialog } from "./DataDialogs";

type Phase = "idle" | "busy" | "done" | "error";
type Op = { phase: Phase; message: string };
const IDLE: Op = { phase: "idle", message: "" };

/**
 * Board 06h: export your data, disconnect Meta sign-ins, or wipe everything.
 * Exports call a query once per click and save the returned text as a file.
 * Both destructive actions ask first in a dialog; deleting everything also
 * needs the word DELETE typed exactly. The result of each shows on its card.
 */
export default function DataSection() {
  const client = useConvex();
  const disconnectAll = useMutation(api.dataTools.disconnectAll);
  const deleteEverything = useAction(api.dataTools.deleteEverything);

  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [exportError, setExportError] = useState("");
  const [exported, setExported] = useState("");

  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnect, setDisconnect] = useState<Op>(IDLE);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [wipe, setWipe] = useState<Op>(IDLE);

  const disconnectTrigger = useRef<HTMLButtonElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement>(null);

  async function runExport(kind: ExportKind) {
    if (exporting) return;
    setExporting(kind);
    setExportError("");
    setExported("");
    try {
      const today = localDateKey();
      const result =
        kind === "csv"
          ? await client.query(api.dataTools.exportPostsCsv, { today })
          : await client.query(api.dataTools.exportAllJson, { today });
      const name = downloadFilename(result.filename, kind, today);
      triggerDownload(name, exportBlob(result.content, kind));
      // The export is a bounded read: say so plainly when it hit the cap, so nobody thinks it is complete.
      const capped = Array.isArray(result.truncated) ? result.truncated.length > 0 : result.truncated === true;
      setExported(
        capped
          ? `Downloaded ${name}. It holds only the most recent items, because the account is larger than one download can carry.`
          : `Downloaded ${name}.`
      );
    } catch (err) {
      setExportError(refusalText(err, "Couldn't prepare the export. Try again."));
    } finally {
      setExporting(null);
    }
  }

  function closeDisconnect() {
    setDisconnectOpen(false);
    setTimeout(() => disconnectTrigger.current?.focus(), 0);
  }

  function closeDelete() {
    setDeleteOpen(false);
    setTimeout(() => deleteTrigger.current?.focus(), 0);
  }

  async function runDisconnect() {
    setDisconnect({ phase: "busy", message: "" });
    try {
      const { removed } = await disconnectAll({});
      setDisconnect({ phase: "done", message: disconnectedText(removed) });
      closeDisconnect();
    } catch (err) {
      setDisconnect({ phase: "error", message: refusalText(err, "Couldn't disconnect. Try again.") });
    }
  }

  async function runDelete(confirm: string) {
    setWipe({ phase: "busy", message: "" });
    try {
      const { deleted } = await deleteEverything({ confirm });
      setWipe({ phase: "done", message: deleteSummary(deleted) });
      closeDelete();
    } catch (err) {
      setWipe({ phase: "error", message: refusalText(err, "Couldn't delete everything. Nothing may have changed. Try again.") });
    }
  }

  return (
    <div className="st-stack">
      <section className="sq-card st-export" aria-label="Export">
        <div className="st-card-head">
          <h3 className="st-eyebrow">Export</h3>
        </div>
        <p className="sq-muted st-hint" id="export-help">
          Your posts as a spreadsheet, or everything as one file. Exports never include account tokens.
        </p>
        <div className="st-btn-row">
          <button
            type="button"
            className="sq-btn"
            aria-describedby="export-help"
            aria-busy={exporting === "csv" || undefined}
            disabled={exporting !== null}
            onClick={() => void runExport("csv")}
          >
            {exporting === "csv" ? "Preparing…" : "Download posts (CSV)"}
          </button>
          <button
            type="button"
            className="sq-btn"
            aria-describedby="export-help"
            aria-busy={exporting === "json" || undefined}
            disabled={exporting !== null}
            onClick={() => void runExport("json")}
          >
            {exporting === "json" ? "Preparing…" : "Download everything (JSON)"}
          </button>
        </div>
        <p className="st-live sq-muted" role="status" aria-live="polite">
          {exported}
        </p>
        {exportError && (
          <p className="st-error" role="alert">
            {exportError}
          </p>
        )}
      </section>

      <section className="sq-card st-rows st-danger" aria-label="Disconnect and delete">
        <div className="st-action">
          <div className="st-setting">
            <div className="st-setting-text">
              <span id="disconnect-label" className="st-setting-title">
                Disconnect all accounts
              </span>
              <small id="disconnect-help">
                Removes the saved Threads and Instagram sign-ins. Your drafts, queue and media stay.
              </small>
            </div>
            <button
              type="button"
              className="sq-btn sq-btn-sm st-btn-outline-danger"
              ref={disconnectTrigger}
              aria-labelledby="disconnect-label"
              aria-describedby="disconnect-help"
              onClick={() => {
                setDisconnect(IDLE);
                setDisconnectOpen(true);
              }}
            >
              Disconnect
            </button>
          </div>
          <p className="st-live sq-muted" role="status" aria-live="polite">
            {disconnect.phase === "done" ? disconnect.message : ""}
          </p>
          {disconnect.phase === "error" && !disconnectOpen && (
            <p className="st-error" role="alert">
              {disconnect.message}
            </p>
          )}
        </div>

        <div className="st-action">
          <div className="st-setting">
            <div className="st-setting-text">
              <span id="delete-label" className="st-setting-title">
                Delete everything
              </span>
              <small id="delete-help">
                Permanently deletes your topics, sources, drafts, queue, media files, frames, templates, settings
                and connections. This cannot be undone.
              </small>
            </div>
            <button
              type="button"
              className="sq-btn sq-btn-sm st-btn-danger"
              ref={deleteTrigger}
              aria-labelledby="delete-label"
              aria-describedby="delete-help"
              onClick={() => {
                setWipe(IDLE);
                setDeleteOpen(true);
              }}
            >
              Delete
            </button>
          </div>
          <p className="st-live sq-muted" role="status" aria-live="polite">
            {wipe.phase === "busy" && !deleteOpen ? "Deleting…" : wipe.phase === "done" ? wipe.message : ""}
          </p>
          {wipe.phase === "error" && !deleteOpen && (
            <p className="st-error" role="alert">
              {wipe.message}
            </p>
          )}
        </div>
      </section>

      {disconnectOpen && (
        <DisconnectDialog
          busy={disconnect.phase === "busy"}
          error={disconnect.phase === "error" ? disconnect.message : ""}
          onConfirm={() => void runDisconnect()}
          onClose={closeDisconnect}
        />
      )}
      {deleteOpen && (
        <DeleteEverythingDialog
          busy={wipe.phase === "busy"}
          error={wipe.phase === "error" ? wipe.message : ""}
          onConfirm={(confirm) => void runDelete(confirm)}
          onClose={closeDelete}
        />
      )}
    </div>
  );
}
