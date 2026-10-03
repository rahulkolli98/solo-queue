import { createLocalJWKSet, exportJWK, exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  OPERATOR_AUDIENCE,
  OPERATOR_ISSUER,
  OPERATOR_KEY_ID,
  OPERATOR_SUBJECT,
  OPERATOR_TOKEN_TTL_SECONDS,
} from "../../convex/lib/operatorConfig";
import { OperatorKeyMissingError, mintOperatorToken } from "./operatorToken";

let privateEnv = "";
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  privateEnv = Buffer.from(await exportPKCS8(privateKey), "utf8").toString("base64");
  jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: OPERATOR_KEY_ID, alg: "RS256" }] });
});

describe("mintOperatorToken", () => {
  it("signs a token Convex can verify with the public key set", async () => {
    const { token, expiresAt } = await mintOperatorToken(undefined, { OPERATOR_JWT_PRIVATE_KEY: privateEnv });
    const { payload, protectedHeader } = await jwtVerify(token, jwks, {
      issuer: OPERATOR_ISSUER,
      audience: OPERATOR_AUDIENCE,
    });
    expect(payload.sub).toBe(OPERATOR_SUBJECT);
    expect(protectedHeader.kid).toBe(OPERATOR_KEY_ID);
    expect(payload.exp).toBe(Math.floor(expiresAt / 1000));
    expect((payload.exp as number) - (payload.iat as number)).toBe(OPERATOR_TOKEN_TTL_SECONDS);
  });

  it("honours a shorter lifetime (the OAuth callback)", async () => {
    const { token } = await mintOperatorToken(60, { OPERATOR_JWT_PRIVATE_KEY: privateEnv });
    const { payload } = await jwtVerify(token, jwks);
    expect((payload.exp as number) - (payload.iat as number)).toBe(60);
  });

  it("is rejected by a different key set", async () => {
    const other = await generateKeyPair("RS256", { extractable: true });
    const otherSet = createLocalJWKSet({
      keys: [{ ...(await exportJWK(other.publicKey)), kid: OPERATOR_KEY_ID, alg: "RS256" }],
    });
    const { token } = await mintOperatorToken(undefined, { OPERATOR_JWT_PRIVATE_KEY: privateEnv });
    await expect(jwtVerify(token, otherSet)).rejects.toThrow();
  });

  it("fails loudly when the private key is not configured", async () => {
    await expect(mintOperatorToken(undefined, {})).rejects.toBeInstanceOf(OperatorKeyMissingError);
  });
});
