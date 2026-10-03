/**
 * The operator token contract, shared by the Next token route (which signs),
 * `convex/auth.config.ts` (which verifies) and `requireOperator` (which checks
 * who is calling). Solo Queue has exactly one user, the operator.
 */
export const OPERATOR_ISSUER = "https://solo-queue.operator";
/** Audience Convex requires in the token (`applicationID` in auth.config.ts). */
export const OPERATOR_AUDIENCE = "solo-queue-convex";
export const OPERATOR_SUBJECT = "operator";
/** What Convex reports as `identity.tokenIdentifier` for the operator. */
export const OPERATOR_TOKEN_IDENTIFIER = `${OPERATOR_ISSUER}|${OPERATOR_SUBJECT}`;
/** Browser tokens live an hour; the client refreshes them before they expire. */
export const OPERATOR_TOKEN_TTL_SECONDS = 60 * 60;
/** The OAuth callback only needs a token for the one `exchangeCode` call. */
export const OPERATOR_CALLBACK_TOKEN_TTL_SECONDS = 60;
/** Signing algorithm (Convex supports RS256 and ES256). */
export const OPERATOR_JWT_ALG = "RS256";
/** Key id in the token header; it must match the JWKS entry. */
export const OPERATOR_KEY_ID = "operator-1";
