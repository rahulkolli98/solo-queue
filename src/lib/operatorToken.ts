import { SignJWT, importPKCS8 } from "jose";
import {
  OPERATOR_AUDIENCE,
  OPERATOR_ISSUER,
  OPERATOR_JWT_ALG,
  OPERATOR_KEY_ID,
  OPERATOR_SUBJECT,
  OPERATOR_TOKEN_TTL_SECONDS,
} from "../../convex/lib/operatorConfig";

/**
 * Server-only: mints the short-lived token that lets the browser (and the
 * OAuth callback) call Convex as the operator. The private key lives only in
 * the app's server env as base64 of the PKCS8 PEM (`OPERATOR_JWT_PRIVATE_KEY`).
 */

export class OperatorKeyMissingError extends Error {
  constructor() {
    super("OPERATOR_JWT_PRIVATE_KEY is not set. Run scripts/operator-keys.mjs (see README, Operator auth).");
    this.name = "OperatorKeyMissingError";
  }
}

export interface OperatorToken {
  token: string;
  /** Epoch ms when the token stops being valid. */
  expiresAt: number;
}

export async function mintOperatorToken(
  ttlSeconds: number = OPERATOR_TOKEN_TTL_SECONDS,
  env: Record<string, string | undefined> = process.env
): Promise<OperatorToken> {
  const encoded = env.OPERATOR_JWT_PRIVATE_KEY;
  if (!encoded) throw new OperatorKeyMissingError();
  const pem = Buffer.from(encoded, "base64").toString("utf8");
  const key = await importPKCS8(pem, OPERATOR_JWT_ALG);
  const issuedAt = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: OPERATOR_JWT_ALG, kid: OPERATOR_KEY_ID })
    .setIssuer(OPERATOR_ISSUER)
    .setAudience(OPERATOR_AUDIENCE)
    .setSubject(OPERATOR_SUBJECT)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttlSeconds)
    .sign(key);
  return { token, expiresAt: (issuedAt + ttlSeconds) * 1000 };
}
