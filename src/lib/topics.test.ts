import { describe, expect, it } from "vitest";
import { compareTopics } from "../../convex/lib/topicOrder";

const t = (status: "drafting" | "ready" | "queued" | "done", createdAt: number) => ({
  status,
  createdAt,
});

describe("compareTopics", () => {
  it("orders unqueued statuses before queued and done", () => {
    const rows = [t("done", 1), t("queued", 1), t("ready", 1), t("drafting", 1)];
    expect([...rows].sort(compareTopics).map((r) => r.status)).toEqual([
      "drafting",
      "ready",
      "queued",
      "done",
    ]);
  });

  it("is FIFO within a rank", () => {
    const rows = [t("ready", 300), t("ready", 100), t("ready", 200)];
    expect([...rows].sort(compareTopics).map((r) => r.createdAt)).toEqual([
      100, 200, 300,
    ]);
  });

  it("keeps a ready topic ahead of an older queued one", () => {
    const rows = [t("queued", 100), t("drafting", 500)];
    expect([...rows].sort(compareTopics)[0]).toEqual(t("drafting", 500));
  });
});
