import type { Episode } from "@/context/PodcastContext";

/**
 * Returns the items from `incoming` not already present in `existing`.
 * Identity is the episode's audioUrl: episode ids are randomly generated per
 * refresh, so the same new episode gets different ids from the foreground and
 * background refreshers — the audio URL is the only stable key.
 */
export function filterNewEpisodes<T extends { audioUrl: string }>(
  existing: Episode[],
  incoming: T[]
): T[] {
  const existingUrls = new Set(existing.map((e) => e.audioUrl));
  return incoming.filter((e) => !existingUrls.has(e.audioUrl));
}

/**
 * Prepends the not-yet-present items of `incoming` to `existing` (newest
 * first). Returns null when there is nothing new, so callers can skip state
 * churn and storage writes.
 */
export function mergeEpisodeLists(
  existing: Episode[],
  incoming: Episode[]
): Episode[] | null {
  const fresh = filterNewEpisodes(existing, incoming);
  return fresh.length > 0 ? [...fresh, ...existing] : null;
}
