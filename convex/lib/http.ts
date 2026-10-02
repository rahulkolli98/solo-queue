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
    throw new Error(
      `URL not reachable (${err instanceof Error ? err.message : "network error"}).`
    );
  }
}
