import {
  OPERATOR_AUDIENCE,
  OPERATOR_ISSUER,
  OPERATOR_JWT_ALG,
} from "./lib/operatorConfig";

/**
 * Convex trusts one signer: the operator token minted by the Next route
 * `/api/convex-token` behind Basic Auth. `OPERATOR_JWKS` is the PUBLIC half of
 * the signing key (a data: URI, set with `npx convex env set`). If it is
 * missing the deploy fails here, so the backend never starts open by accident.
 */
const jwks = process.env.OPERATOR_JWKS;
if (!jwks) {
  throw new Error(
    "OPERATOR_JWKS is not set on this Convex deployment. Run scripts/operator-keys.mjs and set it (see README, Operator auth)."
  );
}

export default {
  providers: [
    {
      type: "customJwt" as const,
      applicationID: OPERATOR_AUDIENCE,
      issuer: OPERATOR_ISSUER,
      jwks,
      algorithm: OPERATOR_JWT_ALG,
    },
  ],
};
