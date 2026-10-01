/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as connections from "../connections.js";
import type * as crons from "../crons.js";
import type * as drafting from "../drafting.js";
import type * as drafts from "../drafts.js";
import type * as lib_drafting from "../lib/drafting.js";
import type * as lib_slots from "../lib/slots.js";
import type * as lib_topicOrder from "../lib/topicOrder.js";
import type * as media from "../media.js";
import type * as providers_threads from "../providers/threads.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as slots from "../slots.js";
import type * as templateCopy from "../templateCopy.js";
import type * as templates from "../templates.js";
import type * as topics from "../topics.js";
import type * as waitlist from "../waitlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  connections: typeof connections;
  crons: typeof crons;
  drafting: typeof drafting;
  drafts: typeof drafts;
  "lib/drafting": typeof lib_drafting;
  "lib/slots": typeof lib_slots;
  "lib/topicOrder": typeof lib_topicOrder;
  media: typeof media;
  "providers/threads": typeof providers_threads;
  seed: typeof seed;
  settings: typeof settings;
  slots: typeof slots;
  templateCopy: typeof templateCopy;
  templates: typeof templates;
  topics: typeof topics;
  waitlist: typeof waitlist;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
