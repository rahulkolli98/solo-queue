import { ConvexError } from "convex/values";
import {
  customAction,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { action, mutation, query } from "../_generated/server";
import { OPERATOR_TOKEN_IDENTIFIER } from "./operatorConfig";

/**
 * Every public Convex function is callable by anyone who knows the deployment
 * URL, so every one of them (except the landing page's waitlist) is built with
 * these wrappers. They run `requireOperator` before the handler. A test bans
 * the raw `query` / `mutation` / `action` builders outside `waitlist.ts`, so a
 * new function cannot be added unguarded by mistake.
 */

export const UNAUTHENTICATED_PREFIX = "UNAUTHENTICATED:";

/** Refuse unless the caller holds a valid operator token. Never trust arguments for identity. */
export async function requireOperator(ctx: {
  auth: { getUserIdentity(): Promise<{ tokenIdentifier: string } | null> };
}): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || identity.tokenIdentifier !== OPERATOR_TOKEN_IDENTIFIER) {
    throw new ConvexError(`${UNAUTHENTICATED_PREFIX} Sign in again to use Solo Queue.`);
  }
}

export const operatorQuery = customQuery(query, {
  args: {},
  input: async (ctx) => {
    await requireOperator(ctx);
    return { ctx: {}, args: {} };
  },
});

export const operatorMutation = customMutation(mutation, {
  args: {},
  input: async (ctx) => {
    await requireOperator(ctx);
    return { ctx: {}, args: {} };
  },
});

export const operatorAction = customAction(action, {
  args: {},
  input: async (ctx) => {
    await requireOperator(ctx);
    return { ctx: {}, args: {} };
  },
});
