/**
 * Shared HTTP reachability probe — no Convex dependencies, unit-testable.
 * Used by the media library verifier and the Instagram provider pre-flight.
 * Returns the HTTP status on success; throws `URL not reachable (...)`
 * otherwise. Callers decide whether that is fatal or retryable.
 */
export async function checkReachable(
  url: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 15000
): Promise<number> {
  try {
    const head = await fetchImpl(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const headStatus = head.status;
    // Some hosts reject HEAD — fall back to a ranged GET.
    if (!head.ok && headStatus !== 404) {
      const get = await fetchImpl(url, {
        headers: { Range: "bytes=0-0" },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const getStatus = get.status;
      // 206 (partial) or 200 both prove the bytes are there.
      if (get.ok || getStatus === 206) return getStatus;
      throw new Error(`URL not reachable (HTTP ${getStatus}).`);
    }
    if (!head.ok) throw new Error(`URL not reachable (HTTP ${headStatus}).`);
    return headStatus;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("URL not reachable")) throw err;
    throw new Error(`URL not reachable (${networkReason(err)}).`);
  }
}

/** What a failed fetch means in plain words: the raw system error ("os error 10061") is no use to the founder. */
export function networkReason(err: unknown): string {
  const m = (err instanceof Error ? err.message : "").toLowerCase();
  if (/refused|econnrefused|os error 10061/.test(m)) return "the host refused the connection";
  if (/dns|enotfound|no such host|not known|os error 11001|getaddrinfo/.test(m)) return "the host name was not found";
  if (/timeout|timed out|abort/.test(m)) return "the host did not answer in time";
  if (/certificate|ssl|tls/.test(m)) return "the host's security certificate was not accepted";
  return "network error";
}

export interface UrlProbe {
  status: number;
  /** The media type the server reports, lower-cased and without parameters; "" when absent. */
  contentType: string;
}

const MEDIA_EXTENSION = /\.(jpe?g|png|gif|webp|heic|mp4|mov|m4v|webm)(?:$|[?#])/i;

/**
 * Like `checkReachable`, but also reports what the URL serves. A web page that
 * answers 200 (a YouTube or Drive link, say) is reachable but is not a media
 * file Instagram can fetch, so callers need the content type to tell them apart.
 */
export async function probeUrl(
  url: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 15000
): Promise<UrlProbe> {
  const read = (res: Response): UrlProbe => ({
    status: res.status,
    contentType: (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase(),
  });
  try {
    const head = await fetchImpl(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    if (head.ok) return read(head);
    if (head.status === 404) throw new Error(`URL not reachable (HTTP ${head.status}).`);
    // Some hosts reject HEAD: fall back to a ranged GET.
    const get = await fetchImpl(url, {
      headers: { Range: "bytes=0-0" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (get.ok || get.status === 206) return read(get);
    throw new Error(`URL not reachable (HTTP ${get.status}).`);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("URL not reachable")) throw err;
    throw new Error(`URL not reachable (${networkReason(err)}).`);
  }
}

/**
 * Judge a probe: is this URL a direct image or video file? Returns the media
 * type to store, or a readable reason it is not. Some CDNs serve video as
 * application/octet-stream, so that is accepted only when the URL ends in a
 * media file extension.
 */
export function judgeMedia(url: string, probe: UrlProbe): { ok: true; mimeType: string } | { ok: false; reason: string } {
  const type = probe.contentType;
  if (type.startsWith("image/") || type.startsWith("video/")) return { ok: true, mimeType: type };
  const looksLikeFile = MEDIA_EXTENSION.test(url);
  if ((type === "" || type === "application/octet-stream" || type === "binary/octet-stream") && looksLikeFile) {
    const ext = (MEDIA_EXTENSION.exec(url)?.[1] ?? "").toLowerCase();
    const video = ["mp4", "mov", "m4v", "webm"].includes(ext);
    return { ok: true, mimeType: video ? (ext === "webm" ? "video/webm" : ext === "mov" ? "video/quicktime" : "video/mp4") : `image/${ext === "jpg" ? "jpeg" : ext}` };
  }
  const what = type ? `a ${type} page` : "something that is not an image or video";
  return {
    ok: false,
    reason: `That link is ${what}, not an image or video file. Instagram needs a direct link to the file (ending in .jpg, .png, .mp4 and so on). Pages like YouTube, Vimeo or Google Drive do not work: upload the file instead.`,
  };
}
