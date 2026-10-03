#!/usr/bin/env node
/**
 * Anonymous probe: is the deployment locked? Needs no key, so it is safe to
 * point at production after the operator-auth deploy.
 *
 *   node scripts/check-public-lock.mjs https://<deployment>.convex.cloud
 *
 * Every guarded function must answer UNAUTHENTICATED to an anonymous caller;
 * only the waitlist may answer. If a probe is NOT refused the script says so
 * and exits 1 (a refused mutation writes nothing, so the probes are safe).
 */
import { ConvexHttpClient } from "convex/browser";

const url = process.argv[2];
if (!url || !/^(https:\/\/[a-z0-9-]+\.convex\.cloud|http:\/\/(127\.0\.0\.1|localhost):\d+)\/?$/.test(url)) {
  console.error("Usage: node scripts/check-public-lock.mjs https://<deployment>.convex.cloud   (or http://127.0.0.1:3210)");
  process.exit(1);
}
const client = new ConvexHttpClient(url);

let failed = 0;
const report = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed += 1;
};
const attempt = async (fn) => {
  try {
    await fn();
    return { refused: false, message: "" };
  } catch (e) {
    return { refused: true, message: String(e?.data ?? e?.message ?? e) };
  }
};
const unauthenticated = (r) => r.refused && r.message.startsWith("UNAUTHENTICATED");

// Probes that need no valid ids: queries with no arguments, and one mutation.
const queries = ["settings:get", "today:summary", "topics:list", "frames:list", "media:list", "connections:listPublic", "library:drafts"];
for (const name of queries) {
  const args = name === "today:summary" ? { now: Date.now() } : {};
  const r = await attempt(() => client.query(name, args));
  report(`anonymous ${name} is refused`, unauthenticated(r), r.message.slice(0, 70).replace(/\s+/g, " "));
}
const m = await attempt(() => client.mutation("topics:create", { title: "lock probe (must be refused)" }));
report("anonymous topics:create is refused", unauthenticated(m), m.message.slice(0, 70).replace(/\s+/g, " "));
const w = await attempt(() => client.query("waitlist:count", {}));
report("waitlist:count stays public (landing page)", !w.refused, w.message.slice(0, 70));

console.log(failed === 0 ? "\nLocked: anonymous callers are refused." : `\n${failed} probe(s) NOT locked. Do not enable live publishing.`);
process.exit(failed === 0 ? 0 : 1);
