#!/usr/bin/env node
/**
 * Live check of the operator gate against the deployment named in .env.local
 * (the LOCAL backend in normal use). Prints pass/fail only, never key material.
 *
 *   node scripts/verify-operator-auth.mjs
 */
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { SignJWT, generateKeyPair, importPKCS8 } from "jose";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const url = env.NEXT_PUBLIC_CONVEX_URL;
if (!url || !env.OPERATOR_JWT_PRIVATE_KEY) {
  console.error("Need NEXT_PUBLIC_CONVEX_URL and OPERATOR_JWT_PRIVATE_KEY in .env.local (run scripts/operator-keys.mjs --local).");
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(url) && !process.argv.includes("--allow-remote")) {
  console.error(`Refusing to run against ${new URL(url).host}. Pass --allow-remote if you really mean it.`);
  process.exit(1);
}

const ISSUER = "https://solo-queue.operator";
const AUDIENCE = "solo-queue-convex";
const pem = Buffer.from(env.OPERATOR_JWT_PRIVATE_KEY, "base64").toString("utf8");

async function token({ key, kid = "operator-1", ttl = 300, issuer = ISSUER, audience = AUDIENCE, subject = "operator" } = {}) {
  const signer = key ?? (await importPKCS8(pem, "RS256"));
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt(now - (ttl < 0 ? 3600 : 0))
    .setExpirationTime(now + ttl)
    .sign(signer);
}

let failed = 0;
function report(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed += 1;
}
function clientWith(jwt) {
  const c = new ConvexHttpClient(url);
  if (jwt) c.setAuth(jwt);
  return c;
}
async function refused(fn) {
  try {
    await fn();
    return { refused: false };
  } catch (e) {
    return { refused: true, message: String(e?.data ?? e?.message ?? e).slice(0, 120) };
  }
}
const functions = {
  settings: "settings:get",
  count: "topics:count",
  waitlistCount: "waitlist:count",
};
const q = (c, name, args = {}) => c.query(name, args);

// 1. Anonymous callers.
const anon = clientWith(null);
let r = await refused(() => q(anon, functions.settings));
report("anonymous query is refused", r.refused, r.message);
r = await refused(() => anon.mutation("topics:create", { title: "should never exist" }));
report("anonymous mutation is refused", r.refused, r.message);
r = await refused(() => q(anon, functions.waitlistCount));
report("waitlist stays public", !r.refused);

// 2. A valid operator token.
const good = clientWith(await token());
r = await refused(() => q(good, functions.settings));
report("valid operator token is accepted", !r.refused, r.message);

// 3. Actions: refused anonymously, and their internal api.* calls keep the operator identity.
const topicId = await good.mutation("topics:create", { title: "operator auth check (safe to delete)" });
try {
  r = await refused(() => anon.action("research:angles", { topicId }));
  report("anonymous action is refused", r.refused && /UNAUTHENTICATED/.test(r.message ?? ""), r.message);
  r = await refused(() => good.action("research:angles", { topicId }));
  // The model call may fail for its own reasons; what matters is that auth did not.
  report("action keeps the operator identity for its own api.* calls", !/UNAUTHENTICATED/.test(r.message ?? ""), r.refused ? r.message : "ran");
} finally {
  await good.mutation("topics:remove", { id: topicId });
}

// 4. Forged and invalid tokens.
const other = await generateKeyPair("RS256");
r = await refused(async () => q(clientWith(await token({ key: other.privateKey })), functions.settings));
report("token signed by another key is refused", r.refused);
r = await refused(async () => q(clientWith(await token({ ttl: -60 })), functions.settings));
report("expired token is refused", r.refused);
r = await refused(async () => q(clientWith(await token({ audience: "someone-else" })), functions.settings));
report("wrong audience is refused", r.refused);
r = await refused(async () => q(clientWith(await token({ subject: "intruder" })), functions.settings));
report("a different subject is refused", r.refused);

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
