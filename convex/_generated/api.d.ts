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
import type * as dataTools from "../dataTools.js";
import type * as drafting from "../drafting.js";
import type * as drafts from "../drafts.js";
import type * as frameProposal from "../frameProposal.js";
import type * as frames from "../frames.js";
import type * as lib_carouselDraft from "../lib/carouselDraft.js";
import type * as lib_carouselMedia from "../lib/carouselMedia.js";
import type * as lib_carouselSlides from "../lib/carouselSlides.js";
import type * as lib_carouselValidators from "../lib/carouselValidators.js";
import type * as lib_connectionRisk from "../lib/connectionRisk.js";
import type * as lib_coverage from "../lib/coverage.js";
import type * as lib_drafting from "../lib/drafting.js";
import type * as lib_formatSetup from "../lib/formatSetup.js";
import type * as lib_frameProposal from "../lib/frameProposal.js";
import type * as lib_framesModel from "../lib/framesModel.js";
import type * as lib_http from "../lib/http.js";
import type * as lib_llm from "../lib/llm.js";
import type * as lib_looks from "../lib/looks.js";
import type * as lib_operator from "../lib/operator.js";
import type * as lib_operatorConfig from "../lib/operatorConfig.js";
import type * as lib_ownCarousel from "../lib/ownCarousel.js";
import type * as lib_postText from "../lib/postText.js";
import type * as lib_queueHold from "../lib/queueHold.js";
import type * as lib_queueHoldDb from "../lib/queueHoldDb.js";
import type * as lib_queueRules from "../lib/queueRules.js";
import type * as lib_research from "../lib/research.js";
import type * as lib_safety from "../lib/safety.js";
import type * as lib_settingsDb from "../lib/settingsDb.js";
import type * as lib_settingsModel from "../lib/settingsModel.js";
import type * as lib_slotPlanning from "../lib/slotPlanning.js";
import type * as lib_slots from "../lib/slots.js";
import type * as lib_themes from "../lib/themes.js";
import type * as lib_threadReplies from "../lib/threadReplies.js";
import type * as lib_topicOrder from "../lib/topicOrder.js";
import type * as lib_vacationShift from "../lib/vacationShift.js";
import type * as lib_voiceRules from "../lib/voiceRules.js";
import type * as lib_zoned from "../lib/zoned.js";
import type * as library from "../library.js";
import type * as looks from "../looks.js";
import type * as media from "../media.js";
import type * as providers_instagram from "../providers/instagram.js";
import type * as providers_threads from "../providers/threads.js";
import type * as publish from "../publish.js";
import type * as publishLog from "../publishLog.js";
import type * as queueBoard from "../queueBoard.js";
import type * as research from "../research.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as slotRecovery from "../slotRecovery.js";
import type * as slots from "../slots.js";
import type * as sources from "../sources.js";
import type * as templateCopy from "../templateCopy.js";
import type * as templates from "../templates.js";
import type * as today from "../today.js";
import type * as topics from "../topics.js";
import type * as voice from "../voice.js";
import type * as waitlist from "../waitlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  connections: typeof connections;
  crons: typeof crons;
  dataTools: typeof dataTools;
  drafting: typeof drafting;
  drafts: typeof drafts;
  frameProposal: typeof frameProposal;
  frames: typeof frames;
  "lib/carouselDraft": typeof lib_carouselDraft;
  "lib/carouselMedia": typeof lib_carouselMedia;
  "lib/carouselSlides": typeof lib_carouselSlides;
  "lib/carouselValidators": typeof lib_carouselValidators;
  "lib/connectionRisk": typeof lib_connectionRisk;
  "lib/coverage": typeof lib_coverage;
  "lib/drafting": typeof lib_drafting;
  "lib/formatSetup": typeof lib_formatSetup;
  "lib/frameProposal": typeof lib_frameProposal;
  "lib/framesModel": typeof lib_framesModel;
  "lib/http": typeof lib_http;
  "lib/llm": typeof lib_llm;
  "lib/looks": typeof lib_looks;
  "lib/operator": typeof lib_operator;
  "lib/operatorConfig": typeof lib_operatorConfig;
  "lib/ownCarousel": typeof lib_ownCarousel;
  "lib/postText": typeof lib_postText;
  "lib/queueHold": typeof lib_queueHold;
  "lib/queueHoldDb": typeof lib_queueHoldDb;
  "lib/queueRules": typeof lib_queueRules;
  "lib/research": typeof lib_research;
  "lib/safety": typeof lib_safety;
  "lib/settingsDb": typeof lib_settingsDb;
  "lib/settingsModel": typeof lib_settingsModel;
  "lib/slotPlanning": typeof lib_slotPlanning;
  "lib/slots": typeof lib_slots;
  "lib/themes": typeof lib_themes;
  "lib/threadReplies": typeof lib_threadReplies;
  "lib/topicOrder": typeof lib_topicOrder;
  "lib/vacationShift": typeof lib_vacationShift;
  "lib/voiceRules": typeof lib_voiceRules;
  "lib/zoned": typeof lib_zoned;
  library: typeof library;
  looks: typeof looks;
  media: typeof media;
  "providers/instagram": typeof providers_instagram;
  "providers/threads": typeof providers_threads;
  publish: typeof publish;
  publishLog: typeof publishLog;
  queueBoard: typeof queueBoard;
  research: typeof research;
  seed: typeof seed;
  settings: typeof settings;
  slotRecovery: typeof slotRecovery;
  slots: typeof slots;
  sources: typeof sources;
  templateCopy: typeof templateCopy;
  templates: typeof templates;
  today: typeof today;
  topics: typeof topics;
  voice: typeof voice;
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
