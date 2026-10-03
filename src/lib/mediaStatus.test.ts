import { describe, expect, it } from "vitest";
import { VERIFIED_TTL_MS } from "../../convex/lib/slots";
import {
  agoLabel,
  mediaHost,
  mediaStatus,
  mediaTypeLabel,
  UPLOAD_INSTEAD,
  type MediaLike,
} from "./mediaStatus";

const NOW = 1_800_000_000_000;
const HOUR = 3600 * 1000;
const base: MediaLike = { mimeType: "image/jpeg", publicUrl: "https://picsum.photos/200/300.jpg", source: "external" };

describe("mediaStatus", () => {
  it("is READY FOR INSTAGRAM for a fresh verified image, with how long ago", () => {
    const s = mediaStatus({ ...base, verifiedAt: NOW - 3 * HOUR }, NOW);
    expect(s.kind).toBe("ready");
    expect(s.label).toBe("READY FOR INSTAGRAM");
    expect(s.checked).toBe("checked 3 h ago");
    expect(s.reason).toBeNull();
  });

  it("is READY FOR INSTAGRAM for a verified video", () => {
    expect(mediaStatus({ ...base, mimeType: "video/mp4", verifiedAt: NOW - 1000 }, NOW).kind).toBe("ready");
  });

  it("is NOT A MEDIA FILE with the full reason and the next step when the check refused it", () => {
    const reason =
      "That link is a text/html page, not an image or video file. Instagram needs a direct link to the file itself.";
    const s = mediaStatus({ ...base, lastVerifyError: reason }, NOW);
    expect(s.kind).toBe("not_media");
    expect(s.label).toBe("NOT A MEDIA FILE");
    expect(s.reason).toBe(reason);
    expect(s.next).toBe(UPLOAD_INSTEAD);
  });

  it("is NOT CHECKED YET when never checked and nothing failed", () => {
    const s = mediaStatus(base, NOW);
    expect(s.kind).toBe("unchecked");
    expect(s.label).toBe("NOT CHECKED YET");
  });

  it("is CHECK AGAIN SOON once the 24 h freshness window has passed", () => {
    expect(mediaStatus({ ...base, verifiedAt: NOW - VERIFIED_TTL_MS }, NOW).kind).toBe("ready");
    const s = mediaStatus({ ...base, verifiedAt: NOW - VERIFIED_TTL_MS - 1 }, NOW);
    expect(s.kind).toBe("recheck");
    expect(s.label).toBe("CHECK AGAIN SOON");
    expect(s.checked).toBe("checked 1 d ago");
  });

  it("does not trust an old 'verified' on a page link (YouTube) or a non-media type", () => {
    const yt = mediaStatus(
      { ...base, publicUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", verifiedAt: NOW - HOUR },
      NOW
    );
    expect(yt.kind).toBe("not_media");
    expect(yt.reason).toContain("not an image or video file");
    expect(mediaStatus({ ...base, mimeType: "text/html", verifiedAt: NOW - HOUR }, NOW).kind).toBe("not_media");
  });

  it("an uploaded file is never judged by its host", () => {
    const up: MediaLike = { mimeType: "video/mp4", publicUrl: "https://youtube.com/x.mp4", source: "upload", verifiedAt: NOW };
    expect(mediaStatus(up, NOW).kind).toBe("ready");
  });
});

describe("media labels", () => {
  it("formats how long ago", () => {
    expect(agoLabel(NOW, NOW)).toBe("just now");
    expect(agoLabel(NOW - 12 * 60000, NOW)).toBe("12 min ago");
    expect(agoLabel(NOW - 5 * HOUR, NOW)).toBe("5 h ago");
    expect(agoLabel(NOW - 49 * HOUR, NOW)).toBe("2 d ago");
  });

  it("says the type and the host", () => {
    expect(mediaTypeLabel("video/quicktime")).toBe("VIDEO");
    expect(mediaTypeLabel("image/png")).toBe("IMAGE");
    expect(mediaHost({ publicUrl: "https://www.picsum.photos/a.jpg", source: "external" })).toBe("picsum.photos");
    expect(mediaHost({ publicUrl: "http://127.0.0.1:3211/api/storage/x", source: "upload" })).toBe("Uploaded");
    expect(mediaHost({ publicUrl: "nonsense" })).toBe("External link");
  });
});
