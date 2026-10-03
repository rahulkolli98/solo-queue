import { afterEach, describe, expect, it, vi } from "vitest";
import { TOKEN_PATH, fetchOperatorToken } from "./useOperatorAuth";

afterEach(() => vi.unstubAllGlobals());

const stubFetch = (impl: () => Promise<unknown>) => vi.stubGlobal("fetch", vi.fn(impl));

describe("fetchOperatorToken", () => {
  it("returns the token and asks for a fresh, uncached one", async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ token: "abc.def.ghi" }) }));
    expect(await fetchOperatorToken()).toBe("abc.def.ghi");
    expect(fetch).toHaveBeenCalledWith(TOKEN_PATH, { cache: "no-store", credentials: "same-origin" });
  });

  it("returns null when the login was dropped, the key is missing or the body is wrong", async () => {
    stubFetch(async () => ({ ok: false, json: async () => ({}) }));
    expect(await fetchOperatorToken()).toBeNull();
    stubFetch(async () => ({ ok: true, json: async () => ({ token: 42 }) }));
    expect(await fetchOperatorToken()).toBeNull();
    stubFetch(async () => ({ ok: true, json: async () => ({ token: "" }) }));
    expect(await fetchOperatorToken()).toBeNull();
  });

  it("returns null when the network fails", async () => {
    stubFetch(async () => {
      throw new Error("offline");
    });
    expect(await fetchOperatorToken()).toBeNull();
  });
});
