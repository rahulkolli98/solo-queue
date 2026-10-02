/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

/**
 * Shared helpers for Convex function tests (convex-test, in-memory backend).
 * Lives outside convex/ on purpose: files in convex/ are bundled as backend code.
 */
const modules = import.meta.glob(["../../convex/**/*.ts", "!../../convex/**/*.test.ts"]);

export function newTest() {
  return convexTest(schema, modules);
}

export type TestConvex = ReturnType<typeof newTest>;

export async function insertTopic(t: TestConvex, title = "A topic"): Promise<Id<"topics">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("topics", { title, status: "drafting", createdAt: Date.now() })
  );
}

export async function insertDraft(
  t: TestConvex,
  topicId: Id<"topics">,
  platform: "threads" | "instagram" | "blog" = "threads",
  body = "Hello world",
  templateKey = "threads-hook-story"
): Promise<Id<"drafts">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("drafts", {
      topicId,
      platform,
      body,
      templateKey,
      templateVersion: 1,
      charCount: body.length,
      constraintOk: true,
      createdAt: Date.now(),
    })
  );
}

export async function insertSlot(
  t: TestConvex,
  draftId: Id<"drafts">,
  scheduledAt: number,
  extra: { platform?: "threads" | "instagram"; status?: "scheduled" | "claimed" | "published" | "failed"; attempts?: number } = {}
): Promise<Id<"slots">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("slots", {
      platform: extra.platform ?? "threads",
      draftId,
      scheduledAt,
      status: extra.status ?? "scheduled",
      attempts: extra.attempts ?? 0,
      createdAt: Date.now(),
    })
  );
}
