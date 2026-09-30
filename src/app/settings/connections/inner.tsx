"use client";

import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
// NOTE: OAuth start links below are plain <a> on purpose. Next <Link>
// navigates via fetch (RSC), and fetch cannot follow the cross-origin
// 307 to Meta (CORS) — the flow dies before leaving the site.
import ConnectionCard, {
  type ConnectionInfo,
} from "@/components/features/ConnectionCard";

function ThreadsTest({ onDone }: { onDone: (msg: string) => void }) {
  const publish = useAction(api.connections.publishThreadsTest);
  const remove = useAction(api.connections.deleteThreadsTest);
  const [phase, setPhase] = useState<"idle" | "publishing" | "deleting">(
    "idle"
  );
  const [mediaId, setMediaId] = useState<string | null>(null);

  async function runPublish() {
    setPhase("publishing");
    try {
      const { id } = await publish({});
      setMediaId(id);
      onDone(`Test post live as ${id} — delete it when ready.`);
    } catch (e) {
      onDone(e instanceof Error ? e.message : "Test publish failed.");
    } finally {
      setPhase("idle");
    }
  }

  async function runDelete() {
    if (!mediaId) return;
    setPhase("deleting");
    try {
      await remove({ mediaId });
      setMediaId(null);
      onDone("Test post deleted. Connection proven end to end.");
    } catch (e) {
      onDone(e instanceof Error ? e.message : "Test delete failed.");
    } finally {
      setPhase("idle");
    }
  }

  return (
    <>
      <button
        className="sq-btn"
        onClick={runPublish}
        disabled={phase !== "idle"}
      >
        {phase === "publishing" ? "Posting…" : "Post test"}
      </button>
      {mediaId && (
        <button
          className="sq-btn sq-btn-primary"
          onClick={runDelete}
          disabled={phase !== "idle"}
        >
          {phase === "deleting" ? "Deleting…" : "Delete test post"}
        </button>
      )}
    </>
  );
}

function InstagramTest({ onDone }: { onDone: (msg: string) => void }) {
  const verify = useAction(api.connections.verifyInstagram);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const r = await verify({});
      onDone(`Token valid for ${r.username} (${r.userId}).`);
    } catch (e) {
      onDone(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="sq-btn" onClick={run} disabled={busy}>
      {busy ? "Verifying…" : "Verify token"}
    </button>
  );
}

function RefreshButton({ platform }: { platform: "threads" | "instagram" }) {
  const refresh = useAction(api.connections.refresh);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    try {
      const r = await refresh({ platform });
      setMsg(
        r.skipped
          ? "Token is fresh — no refresh needed."
          : r.error
            ? `Refresh: ${r.status} — ${r.error}`
            : "Token refreshed."
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="sq-btn" onClick={run} disabled={busy}>
        {busy ? "Refreshing…" : "Refresh token"}
      </button>
      {msg && <span className="sq-muted">{msg}</span>}
    </>
  );
}

export default function ConnectionsInner() {
  const connections = useQuery(api.connections.listPublic);
  const threadsRisk =
    useQuery(api.slots.countScheduledByPlatform, { platform: "threads" }) ?? 0;
  const igRisk =
    useQuery(api.slots.countScheduledByPlatform, { platform: "instagram" }) ??
    0;
  const [notice, setNotice] = useState<string | null>(null);

  const threads =
    connections?.find((c) => c.platform === "threads") ?? null;
  const instagram =
    connections?.find((c) => c.platform === "instagram") ?? null;

  return (
    <>
      {notice && (
        <div className="sq-banner sq-banner-good" role="status">
          {notice}
        </div>
      )}

      {connections === undefined ? (
        <p className="sq-muted">Loading connections…</p>
      ) : (
        <>
          {!threads && !instagram && (
            <p className="sq-muted">
              Setup order: connect Threads first (one post proves the whole
              loop), then Instagram.
            </p>
          )}
          <div className="sq-grid">
            <ConnectionCard
              platform="threads"
              connection={threads as ConnectionInfo | null}
              atRiskSlots={threadsRisk}
              actions={
                threads ? (
                  <>
                    <ThreadsTest onDone={setNotice} />
                    <RefreshButton platform="threads" />
                    <a className="sq-btn" href="/api/oauth/threads/start">
                      Reconnect
                    </a>
                  </>
                ) : (
                  <a className="sq-btn" href="/api/oauth/threads/start">
                    Connect Threads
                  </a>
                )
              }
            />
            <ConnectionCard
              platform="instagram"
              connection={instagram as ConnectionInfo | null}
              atRiskSlots={igRisk}
              actions={
                instagram ? (
                  <>
                    <InstagramTest onDone={setNotice} />
                    <RefreshButton platform="instagram" />
                    <a
                      className="sq-btn"
                      href="/api/oauth/instagram/start"
                    >
                      Reconnect
                    </a>
                  </>
                ) : (
                  <a className="sq-btn" href="/api/oauth/instagram/start">
                    Connect Instagram
                  </a>
                )
              }
            />
          </div>
        </>
      )}
    </>
  );
}
