import { z } from "zod";

/**
 * Pure helpers for slot enqueue validation — no I/O, unit-tested.
 * The `enqueue` mutation in ../slots.ts orchestrates these.
 */

/**
 * Refusals carry machine-readable codes: `VALIDATION:<CODE>: <message>`.
 * The UI switches on CODE (queue CTA copy, inline hints) and shows message.
 */
export function refusal(code: string, message: string): Error {
  return new Error(`VALIDATION:${code}: ${message}`);
}

/** Extract {code, message} from a refusal, tolerating Convex's error wrapping. */
export function parseRefusal(err: unknown): { code: string; message: string } | null {
  if (!(err instanceof Error)) return null;
  const at = err.message.indexOf("VALIDATION:");
  if (at === -1) return null;
  const rest = err.message.slice(at + "VALIDATION:".length);
  const sep = rest.indexOf(":");
  if (sep === -1) return null;
  const code = rest.slice(0, sep).trim();
  let message = rest.slice(sep + 1).trim();
  // Strip Convex's trailing stack fragment ("at fn (../...)" / "Called by client").
  message = message.split(/\s+at \w+ \(/)[0].replace(/\s+Called by client\s*$/, "").trim();
  if (!/^[A-Z_]+$/.test(code) || !message) return null;
  return { code, message };
}

/**
 * Single choke point: anything entering the slots table must be
 * publish-shaped. Structural only — platform limits are checked separately
 * so their messages stay specific.
 */
export const enqueuePayloadSchema = z.object({
  platform: z.union([z.literal("threads"), z.literal("instagram")]),
  text: z.string().min(1).max(5000),
  mediaUrl: z.string().url().optional(),
  scheduledAt: z.number().int().positive(),
});

export type EnqueuePayload = z.infer<typeof enqueuePayloadSchema>;

export const SLOT_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Next daily occurrence of an HH:MM slot default (UTC), strictly after `afterMs`. */
export function nextDailyOccurrence(hhmm: string, afterMs: number): number {
  const m = SLOT_TIME_RE.exec(hhmm.trim());
  if (!m) throw new Error(`Bad slot time: ${hhmm}`);
  const d = new Date(afterMs);
  const cand = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    Number(m[1]),
    Number(m[2])
  );
  return cand > afterMs ? cand : cand + 86400000;
}

/** Media verification older than this forces a re-verify before enqueue. */
export const VERIFIED_TTL_MS = 24 * 3600 * 1000;
