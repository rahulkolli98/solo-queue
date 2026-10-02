import { ConvexError } from "convex/values";

/**
 * Human-readable text for an error thrown by a Convex call.
 *
 * On a deployed backend a plain `Error` thrown in a function reaches the
 * client as a redacted "Server Error", so user-facing refusals are thrown as
 * `ConvexError` with a string payload; read that first.
 */
export function errorText(e: unknown, fallback: string): string {
  if (e instanceof ConvexError && typeof e.data === "string") return e.data;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}
