import { createLocalJWKSet, exportJWK, exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { OPERATOR_AUDIENCE, OPERATOR_ISSUER, OPERATOR_KEY_ID } from "../../../../convex/lib/operatorConfig";
import { GET } from "./route";

let privateEnv = "";
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  privateEnv = Buffer.from(await exportPKCS8(privateKey), "utf8").toString("base64");
  jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: OPERATOR_KEY_ID, alg: "RS256" }] });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const call = (headers: Record<string, string> = {}) =>
  GET(new Request("https://app.example.test/api/convex-token", { headers }));

describe("GET /api/convex-token", () => {
  it("returns a verifiable operator token that is never cached", async () => {
    vi.stubEnv("OPERATOR_JWT_PRIVATE_KEY", privateEnv);
    const res = await call({ "sec-fetch-site": "same-origin" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { token: string; expiresAt: number };
    await expect(
      jwtVerify(body.token, jwks, { issuer: OPERATOR_ISSUER, audience: OPERATOR_AUDIENCE })
    ).resolves.toBeTruthy();
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });

  it("accepts a plain navigation or a client without fetch metadata", async () => {
    vi.stubEnv("OPERATOR_JWT_PRIVATE_KEY", privateEnv);
    expect((await call({ "sec-fetch-site": "none" })).status).toBe(200);
    expect((await call()).status).toBe(200);
  });

  it("refuses a request triggered from another site", async () => {
    vi.stubEnv("OPERATOR_JWT_PRIVATE_KEY", privateEnv);
    const res = await call({ "sec-fetch-site": "cross-site" });
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("eyJ");
  });

  it("says what is wrong, without leaking anything, when the key is missing", async () => {
    vi.stubEnv("OPERATOR_JWT_PRIVATE_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call({ "sec-fetch-site": "same-origin" });
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toMatch(/OPERATOR_JWT_PRIVATE_KEY is not set/);
  });
});
