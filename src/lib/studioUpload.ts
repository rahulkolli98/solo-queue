/**
 * Upload a file from the Studio's attach dialog and put it straight on the
 * draft: store it in the library, check it is a real image or video the way
 * Instagram needs, then attach it. Pure orchestration (the Convex calls are
 * passed in) so each step and each way it can stop is unit tested.
 */

export type UploadStage = "uploading" | "checking" | "attaching";

export type UploadOutcome =
  /** Uploaded, checked and attached: the dialog can close. */
  | { kind: "attached"; assetId: string }
  /** The file was refused before upload (wrong type or too big). Nothing was stored. */
  | { kind: "refused"; message: string }
  /** The file is in the library but was not attached; `step` says where it stopped. */
  | { kind: "stopped"; assetId: string; step: "check" | "attach" };

export async function uploadVerifyAttach(args: {
  file: { name: string; type: string; size: number };
  draftId: string;
  /** Why this file cannot be uploaded, or null (`checkUploadFile`). */
  check: (file: { name: string; type: string; size: number }) => string | null;
  upload: (onProgress: (percent: number) => void) => Promise<string>;
  verify: (assetId: string) => Promise<boolean>;
  attach: (draftId: string, assetId: string) => Promise<boolean>;
  onStage: (stage: UploadStage, percent?: number) => void;
}): Promise<UploadOutcome> {
  const refusal = args.check(args.file);
  if (refusal) return { kind: "refused", message: refusal };

  args.onStage("uploading", 0);
  const assetId = await args.upload((percent) => args.onStage("uploading", percent));

  args.onStage("checking");
  if (!(await args.verify(assetId))) return { kind: "stopped", assetId, step: "check" };

  args.onStage("attaching");
  if (!(await args.attach(args.draftId, assetId))) return { kind: "stopped", assetId, step: "attach" };
  return { kind: "attached", assetId };
}

/** The line shown while the upload runs. */
export function uploadStatusText(stage: UploadStage, percent?: number): string {
  if (stage === "uploading") return percent !== undefined && percent > 0 ? `Uploading… ${percent}%` : "Uploading…";
  if (stage === "checking") return "Checking that Instagram can use this file…";
  return "Attaching it to the draft…";
}

/** What to tell the founder when a file is stored but not attached. */
export function stoppedMessage(step: "check" | "attach"): string {
  return step === "check"
    ? "The file is uploaded, but the check found a problem (see above). It is in your library below: remove it or upload another."
    : "The file is uploaded and checked, but attaching it failed (see above). Press Use on it below to try again.";
}
