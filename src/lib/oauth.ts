import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const THREADS_SCOPES = [
  "threads_basic",
  "threads_content_publish",
  "threads_delete",
];
export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
];

export const THREADS_STATE_COOKIE = "sq_oauth_state_threads";
export const INSTAGRAM_STATE_COOKIE = "sq_oauth_state_instagram";

const COOKIE_MAX_AGE = 600; // 10 minutes — longer than any legit auth round-trip

function stateSecret(): string {
  const s = process.env.OAUTH_STATE_SECRET;
  if (!s) throw new Error("OAUTH_STATE_SECRET is not set.");
  return s;
}

/** Signed `nonce.signature` value; store verbatim in the round-trip cookie. */
export function newState(): { state: string } {
  const nonce = randomBytes(32).toString("hex");
  const sig = createHmac("sha256", stateSecret()).update(nonce).digest("hex");
  return { state: `${nonce}.${sig}` };
}

/** True when `state` carries a valid signature AND matches the cookie. */
export function verifyState(state: string | null, cookie: string | null) {
  if (!state || !cookie || state !== cookie) return false;
  const dot = state.indexOf(".");
  if (dot < 1) return false;
  const nonce = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = createHmac("sha256", stateSecret())
    .update(nonce)
    .digest("hex");
  if (sig.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export function stateCookieHeader(
  name: string,
  state: string,
  secure: boolean
): string {
  const parts = [
    `${name}=${state}`,
    "HttpOnly",
    "Path=/api/oauth",
    `Max-Age=${COOKIE_MAX_AGE}`,
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function threadsAuthorizeUrl(args: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
  const p = new URLSearchParams({
    client_id: args.appId,
    redirect_uri: args.redirectUri,
    scope: THREADS_SCOPES.join(","),
    response_type: "code",
    state: args.state,
  });
  return `https://www.threads.com/oauth/authorize?${p.toString()}`;
}

export function instagramAuthorizeUrl(args: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
  const p = new URLSearchParams({
    client_id: args.appId,
    redirect_uri: args.redirectUri,
    scope: INSTAGRAM_SCOPES.join(","),
    response_type: "code",
    state: args.state,
  });
  return `https://api.instagram.com/oauth/authorize?${p.toString()}`;
}
