#!/usr/bin/env node
/**
 * Generates the operator signing key pair (RS256).
 *
 *   node scripts/operator-keys.mjs --local   Local dev: writes the private key to
 *                                            .env.local and the public key set to the
 *                                            LOCAL Convex env. Prints no key material.
 *   node scripts/operator-keys.mjs --print   Production: prints both values for you to
 *                                            paste (private key -> Vercel Production env
 *                                            OPERATOR_JWT_PRIVATE_KEY; public key set ->
 *                                            prod Convex env OPERATOR_JWKS). Writes nothing.
 *
 * The private key signs tokens and must stay in the app's server env. The
 * public key set only verifies them. Each environment gets its own pair.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const KEY_ID = "operator-1";
const mode = process.argv.includes("--local") ? "local" : process.argv.includes("--print") ? "print" : null;
if (!mode) {
  console.error("Usage: node scripts/operator-keys.mjs --local | --print");
  process.exit(1);
}

const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true, modulusLength: 2048 });
const privatePem = await exportPKCS8(privateKey);
const jwk = { ...(await exportJWK(publicKey)), kid: KEY_ID, alg: "RS256", use: "sig" };
const privateEnv = Buffer.from(privatePem, "utf8").toString("base64");
const jwks = `data:text/plain;charset=utf-8;base64,${Buffer.from(JSON.stringify({ keys: [jwk] }), "utf8").toString("base64")}`;

if (mode === "print") {
  console.log("\nProduction operator keys. Paste them, then clear this terminal.\n");
  console.log("1) Vercel > Project > Settings > Environment Variables > Production ONLY");
  console.log("   Name:  OPERATOR_JWT_PRIVATE_KEY");
  console.log(`   Value: ${privateEnv}\n`);
  console.log("2) Convex prod deployment (dashboard > Settings > Environment Variables, or:");
  console.log('   npx convex env set --prod OPERATOR_JWKS "<value>")');
  console.log("   Name:  OPERATOR_JWKS");
  console.log(`   Value: ${jwks}\n`);
  process.exit(0);
}

// --local: private key into .env.local (replacing any old line), public key set into the local Convex env.
const envPath = ".env.local";
const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const eol = existing.includes("\r\n") ? "\r\n" : "\n";
const lines = existing.split(/\r?\n/).filter((l) => l.length > 0 && !l.startsWith("OPERATOR_JWT_PRIVATE_KEY="));
lines.push(`OPERATOR_JWT_PRIVATE_KEY=${privateEnv}`);
writeFileSync(envPath, lines.join(eol) + eol);

const set = spawnSync("npx", ["convex", "env", "set", "OPERATOR_JWKS", jwks], { shell: true, stdio: "pipe", encoding: "utf8" });
if (set.status !== 0) {
  console.error("Wrote .env.local, but setting OPERATOR_JWKS on the local Convex backend failed.");
  console.error("Is the local backend running (scripts/local-backend.ps1)? Re-run this command once it is.");
  process.exit(1);
}
console.log("Local operator keys created: private key in .env.local, public key set in the local Convex env.");
