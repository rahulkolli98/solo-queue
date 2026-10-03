import { ConvexError } from "convex/values";
import { z } from "zod";

/**
 * Pure helpers for slot enqueue validation — no I/O, unit-tested.
 * The `enqueue` mutation in ../slots.ts orchestrates these.
 */

/**
 * Refusals carry machine-readable codes: `VALIDATION:<CODE>: <message>`.
 * The UI switches on CODE (queue CTA copy, inline hints) and shows message.
 */
export function refusal(code: string, message: string): ConvexError<string> {
  // ConvexError (not Error) so the message survives to the client on a
  // deployed backend, where plain errors are redacted to "Server Error".
  return new ConvexError(`VALIDATION:${code}: ${message}`);
}

/** Extract {code, message} from a refusal, tolerating Convex's error wrapping. */
export function parseRefusal(err: unknown): { code: string; message: string } | null {
  let text: string;
  if (err instanceof ConvexError) {
    if (typeof err.data !== "string") return null;
    text = err.data;
  } else if (err instanceof Error) {
    text = err.message;
  } else {
    return null;
  }
  const at = text.indexOf("VALIDATION:");
  if (at === -1) return null;
  const rest = text.slice(at + "VALIDATION:".length);
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

/** Media verification older than this forces a re-verify before enqueue. */
export const VERIFIED_TTL_MS = 24 * 3600 * 1000;
