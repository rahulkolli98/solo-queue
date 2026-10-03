/**
 * Debounced, retrying persistence for inline draft edits (framework-free so
 * it can be unit tested). Edits are kept locally per draft id; the displayed
 * text is the edit when there is one, else the server body.
 *
 * States per draft: idle (nothing typed) -> dirty (typed, save pending) ->
 * saving -> saved, or error (kept locally, retried automatically a couple of
 * times, then on demand).
 */

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export interface DraftStatus {
  state: SaveState;
  /** Epoch ms of the last successful save of this draft. */
  savedAt?: number;
  error?: string;
}

export interface SaverSnapshot {
  edits: Readonly<Record<string, string>>;
  status: Readonly<Record<string, DraftStatus>>;
}

export interface DraftSaverOptions {
  save: (id: string, body: string) => Promise<unknown>;
  /** Idle time after the last keystroke before saving. */
  delayMs?: number;
  /** Wait before an automatic retry after a failed save. */
  retryMs?: number;
  /** Automatic retries after a failure (manual retry is always allowed). */
  maxAutoRetries?: number;
  now?: () => number;
  /** Turns a thrown value into the message shown beside Retry. */
  describeError?: (e: unknown) => string;
}

const EMPTY: SaverSnapshot = { edits: {}, status: {} };

export class DraftSaver {
  private readonly opts: Required<Omit<DraftSaverOptions, "save">> & Pick<DraftSaverOptions, "save">;
  private edits = new Map<string, string>();
  private status = new Map<string, DraftStatus>();
  /** Bodies typed but not yet sent. */
  private pending = new Map<string, string>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private inflight = new Map<string, Promise<void>>();
  private autoRetries = new Map<string, number>();
  private listeners = new Set<() => void>();
  private snapshot: SaverSnapshot = EMPTY;

  constructor(options: DraftSaverOptions) {
    this.opts = {
      delayMs: 800,
      retryMs: 4000,
      maxAutoRetries: 2,
      now: () => Date.now(),
      describeError: (e) => (e instanceof Error && e.message ? e.message : "Couldn't save edits."),
      ...options,
    };
  }

  /** Swap the save function (the mutation hook returns a new one on some renders). */
  setSave(save: DraftSaverOptions["save"]): void {
    this.opts.save = save;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): SaverSnapshot => this.snapshot;

  /** The text to show for a draft. */
  valueFor(id: string, serverBody: string): string {
    return this.edits.get(id) ?? serverBody;
  }

  /** Record an edit and (re)start the debounce. */
  change(id: string, body: string): void {
    this.edits.set(id, body);
    this.pending.set(id, body);
    this.autoRetries.set(id, 0);
    this.setStatus(id, { state: "dirty", savedAt: this.status.get(id)?.savedAt });
    this.schedule(id, this.opts.delayMs);
  }

  /** Send any pending edit of one draft now; resolves when it has settled. */
  async flush(id: string): Promise<void> {
    this.clearTimer(id);
    const running = this.inflight.get(id);
    if (running) await running;
    if (!this.pending.has(id)) return;
    const body = this.pending.get(id) as string;
    this.pending.delete(id);
    const run = this.send(id, body);
    this.inflight.set(id, run);
    try {
      await run;
    } finally {
      this.inflight.delete(id);
    }
  }

  async flushAll(): Promise<void> {
    const ids = new Set([...this.pending.keys(), ...this.inflight.keys()]);
    await Promise.all([...ids].map((id) => this.flush(id)));
  }

  /** Fire-and-forget save of everything pending (page is going away). */
  flushOnUnload(): void {
    for (const [id, body] of this.pending) {
      void Promise.resolve(this.opts.save(id, body)).catch(() => undefined);
    }
  }

  /** Forget local edits (after regenerate the server text is authoritative). */
  discard(id?: string): void {
    const ids = id === undefined ? [...this.edits.keys(), ...this.status.keys()] : [id];
    for (const key of ids) {
      this.clearTimer(key);
      this.edits.delete(key);
      this.pending.delete(key);
      this.status.delete(key);
      this.autoRetries.delete(key);
    }
    this.publish();
  }

  /** True while any draft has unsaved text. */
  hasPending(): boolean {
    return this.pending.size > 0 || this.inflight.size > 0;
  }

  private async send(id: string, body: string): Promise<void> {
    this.setStatus(id, { state: "saving", savedAt: this.status.get(id)?.savedAt });
    try {
      await this.opts.save(id, body);
      this.autoRetries.set(id, 0);
      // A newer edit typed while saving keeps the draft dirty.
      this.setStatus(id, this.pending.has(id)
        ? { state: "dirty", savedAt: this.opts.now() }
        : { state: "saved", savedAt: this.opts.now() });
    } catch (e) {
      if (!this.pending.has(id)) this.pending.set(id, body);
      this.setStatus(id, {
        state: "error",
        savedAt: this.status.get(id)?.savedAt,
        error: this.opts.describeError(e),
      });
      const used = this.autoRetries.get(id) ?? 0;
      if (used < this.opts.maxAutoRetries) {
        this.autoRetries.set(id, used + 1);
        this.schedule(id, this.opts.retryMs);
      }
    }
  }

  private schedule(id: string, ms: number): void {
    this.clearTimer(id);
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        void this.flush(id);
      }, ms)
    );
  }

  private clearTimer(id: string): void {
    const t = this.timers.get(id);
    if (t) clearTimeout(t);
    this.timers.delete(id);
  }

  private setStatus(id: string, status: DraftStatus): void {
    this.status.set(id, status);
    this.publish();
  }

  private publish(): void {
    this.snapshot = {
      edits: Object.fromEntries(this.edits),
      status: Object.fromEntries(this.status),
    };
    for (const l of this.listeners) l();
  }
}

export interface SaveSummary {
  state: SaveState;
  savedAt?: number;
  error?: string;
  /** Draft ids that failed to save. */
  failed: string[];
}

/** One status for the header across the given drafts. */
export function summarizeSaves(snapshot: SaverSnapshot, ids: string[]): SaveSummary {
  const failed: string[] = [];
  let state: SaveState = "idle";
  let savedAt: number | undefined;
  let error: string | undefined;
  const rank: Record<SaveState, number> = { idle: 0, saved: 1, dirty: 2, saving: 3, error: 4 };
  for (const id of ids) {
    const s = snapshot.status[id];
    if (!s) continue;
    if (s.state === "error") {
      failed.push(id);
      error = s.error;
    }
    if (rank[s.state] > rank[state]) state = s.state;
    if (s.savedAt !== undefined && (savedAt === undefined || s.savedAt > savedAt)) savedAt = s.savedAt;
  }
  return { state, savedAt, error, failed };
}
