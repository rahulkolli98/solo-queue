import { describe, expect, it, vi } from "vitest";
import { checkUploadFile } from "@/lib/libraryBoard";
import { stoppedMessage, uploadStatusText, uploadVerifyAttach, type UploadStage } from "@/lib/studioUpload";

const image = { name: "photo.png", type: "image/png", size: 1000 };

function run(over: Partial<Parameters<typeof uploadVerifyAttach>[0]> = {}) {
  const stages: [UploadStage, number | undefined][] = [];
  const calls: string[] = [];
  const args = {
    file: image,
    draftId: "d1",
    check: checkUploadFile,
    upload: vi.fn(async (onProgress: (p: number) => void) => {
      calls.push("upload");
      onProgress(50);
      return "a1";
    }),
    verify: vi.fn(async () => {
      calls.push("verify");
      return true;
    }),
    attach: vi.fn(async () => {
      calls.push("attach");
      return true;
    }),
    onStage: (s: UploadStage, p?: number) => stages.push([s, p]),
    ...over,
  };
  return { args, stages, calls, result: uploadVerifyAttach(args) };
}

describe("uploadVerifyAttach", () => {
  it("uploads, checks, then attaches, in that order, and reports each stage", async () => {
    const r = run();
    expect(await r.result).toEqual({ kind: "attached", assetId: "a1" });
    expect(r.calls).toEqual(["upload", "verify", "attach"]);
    expect(r.args.verify).toHaveBeenCalledWith("a1");
    expect(r.args.attach).toHaveBeenCalledWith("d1", "a1");
    expect(r.stages.map(([s]) => s)).toEqual(["uploading", "uploading", "checking", "attaching"]);
    expect(r.stages[1]).toEqual(["uploading", 50]);
  });

  it("refuses a file that is not an image or video, or is over 50 MB, before uploading anything", async () => {
    const pdf = run({ file: { name: "a.pdf", type: "application/pdf", size: 10 } });
    expect(await pdf.result).toMatchObject({ kind: "refused" });
    expect(pdf.args.upload).not.toHaveBeenCalled();
    const big = run({ file: { name: "big.mp4", type: "video/mp4", size: 60 * 1024 * 1024 } });
    expect(await big.result).toMatchObject({ kind: "refused", message: expect.stringContaining("50 MB") });
    expect(big.args.upload).not.toHaveBeenCalled();
  });

  it("does not attach a file the check refused (for example a page that is not media), and says where it stopped", async () => {
    const r = run({ verify: vi.fn(async () => false) });
    expect(await r.result).toEqual({ kind: "stopped", assetId: "a1", step: "check" });
    expect(r.args.attach).not.toHaveBeenCalled();
  });

  it("reports when attaching itself fails, keeping the uploaded file for a retry", async () => {
    const r = run({ attach: vi.fn(async () => false) });
    expect(await r.result).toEqual({ kind: "stopped", assetId: "a1", step: "attach" });
  });

  it("lets an upload failure reach the caller, and never verifies or attaches", async () => {
    const r = run({ upload: vi.fn(async () => Promise.reject(new Error("Upload failed. Try again."))) });
    await expect(r.result).rejects.toThrow("Upload failed");
    expect(r.args.verify).not.toHaveBeenCalled();
    expect(r.args.attach).not.toHaveBeenCalled();
  });
});

describe("upload wording", () => {
  it("says what is happening at each stage", () => {
    expect(uploadStatusText("uploading", 42)).toBe("Uploading… 42%");
    expect(uploadStatusText("uploading", 0)).toBe("Uploading…");
    expect(uploadStatusText("checking")).toContain("Instagram can use this file");
    expect(uploadStatusText("attaching")).toContain("Attaching");
  });

  it("explains what to do when it stopped at the check or at attaching", () => {
    expect(stoppedMessage("check")).toContain("remove it or upload another");
    expect(stoppedMessage("attach")).toContain("Press Use");
  });
});
