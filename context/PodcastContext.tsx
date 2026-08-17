import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { parseFeed as nativeParseFeed } from "@/modules/feed-parser/src";
import { filterNewEpisodes, mergeEpisodeLists } from "@/utils/episodes";

export interface Podcast {
  id: string;
  feedUrl: string;
  title: string;
  description: string;
  imageUrl: string;
  author: string;
  subscribedAt: number;
}

export interface Episode {
  id: string;
  podcastId: string;
  title: string;
  description: string;
  audioUrl: string;
  imageUrl: string;
  publishedAt: number;
  duration: number;
  fileSize: number;
  downloadedPath?: string;
  downloadProgress?: number;
  isDownloading?: boolean;
  listenedAt?: number;
}

type EpisodeMap = Record<string, Episode[]>;

interface PodcastContextValue {
  podcasts: Podcast[];
  episodes: EpisodeMap;
  isLoading: boolean;
  addPodcast: (feedUrl: string) => Promise<void>;
  removePodcast: (id: string) => void;
  refreshFeed: (podcastId: string) => Promise<void>;
  downloadEpisode: (episode: Episode) => Promise<void>;
  deleteDownload: (episodeId: string) => void;
  getEpisodesByPodcast: (podcastId: string) => Episode[];
  getDownloadedEpisodes: () => Episode[];
  updateEpisode: (episodeId: string, updates: Partial<Episode>) => void;
}

const PodcastContext = createContext<PodcastContextValue | null>(null);

const STORAGE_KEY_PODCASTS = "@podcast_app/podcasts";
const STORAGE_KEY_EPISODES = "@podcast_app/episodes";

// AsyncStorage is the primary store; a mirror copy lives in a document-
// directory file so a corrupted or emptied AsyncStorage can never take the
// library with it. documentDirectory is null on web, where downloads and the
// backup are simply disabled.
const DOWNLOADS_DIR = FileSystem.documentDirectory
  ? FileSystem.documentDirectory + "podcasts/"
  : null;
const BACKUP_FILE = FileSystem.documentDirectory
  ? FileSystem.documentDirectory + "library-backup.json"
  : null;
const BACKUP_TMP = BACKUP_FILE ? BACKUP_FILE + ".tmp" : null;

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

async function parseFeed(feedUrl: string): Promise<{
  podcast: Omit<Podcast, "id" | "subscribedAt">;
  episodes: Omit<Episode, "id" | "podcastId" | "downloadedPath" | "downloadProgress" | "isDownloading">[];
}> {
  const feed = await nativeParseFeed(feedUrl);
  return {
    podcast: {
      feedUrl,
      title: feed.title || "Unknown Podcast",
      description: feed.description,
      imageUrl: feed.imageUrl,
      author: feed.author,
    },
    episodes: feed.episodes,
  };
}

// Strip in-flight download fields — they're meaningless across launches
// (a download can't resume after a kill) and would otherwise leave an
// episode stuck showing "downloading".
function sanitizeEpisodes(episodes: EpisodeMap): EpisodeMap {
  const sanitized: EpisodeMap = {};
  for (const podcastId of Object.keys(episodes)) {
    sanitized[podcastId] = episodes[podcastId].map(
      ({ isDownloading, downloadProgress, ...rest }) => rest
    );
  }
  return sanitized;
}

interface LibraryBackup {
  savedAt: number;
  podcasts: Podcast[];
  episodes: EpisodeMap;
}

async function readBackup(): Promise<LibraryBackup | null> {
  // The .tmp fallback covers a kill between deleting the old backup and
  // moving the fresh one into place.
  for (const path of [BACKUP_FILE, BACKUP_TMP]) {
    if (!path) continue;
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) continue;
      const parsed = JSON.parse(await FileSystem.readAsStringAsync(path));
      if (
        parsed &&
        Array.isArray(parsed.podcasts) &&
        parsed.episodes &&
        typeof parsed.episodes === "object"
      ) {
        return parsed as LibraryBackup;
      }
    } catch (e) {
      console.error("Failed to read library backup at", path, e);
    }
  }
  return null;
}

async function writeBackup(payload: LibraryBackup): Promise<void> {
  if (!BACKUP_FILE || !BACKUP_TMP) return;
  // Write-then-rename so a kill mid-write can never leave a truncated file as
  // the only copy: either the old backup or the finished tmp file survives.
  await FileSystem.writeAsStringAsync(BACKUP_TMP, JSON.stringify(payload));
  await FileSystem.deleteAsync(BACKUP_FILE, { idempotent: true });
  await FileSystem.moveAsync({ from: BACKUP_TMP, to: BACKUP_FILE });
}

export function PodcastProvider({ children }: { children: ReactNode }) {
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [episodes, setEpisodes] = useState<EpisodeMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const downloadTasksRef = useRef<Record<string, FileSystem.DownloadResumable>>({});
  const podcastsRef = useRef(podcasts);
  podcastsRef.current = podcasts;
  const episodesRef = useRef(episodes);
  episodesRef.current = episodes;

  // Per-key hydration guards: persistence for a key stays disabled until that
  // key has been read successfully (from AsyncStorage or the file backup).
  // A failed read must never lead to the empty initial state being written
  // over data that may still be on disk — that is exactly how the library got
  // wiped before. Note: success is tracked per key, so one bad key can't
  // block (or blank) the other.
  const podcastsHydratedRef = useRef(false);
  const episodesHydratedRef = useRef(false);
  // Podcasts removed this session. Resume-reloads merge disk state into
  // memory; this set stops a stale disk snapshot from resurrecting a
  // subscription the user just removed.
  const removedPodcastIdsRef = useRef<Set<string>>(new Set());
  const hydratePromiseRef = useRef<Promise<void> | null>(null);

  const loadFromStorage = useCallback(async (): Promise<{
    loadedPodcasts: Podcast[] | null;
    loadedEpisodes: EpisodeMap | null;
  }> => {
    // Each key resolves independently (allSettled, not all): one failing read
    // must not discard the other key's good result. `null` means "could not
    // be read" and is treated differently from "key absent" (first launch),
    // which yields the empty default.
    const [pRes, eRes] = await Promise.allSettled([
      AsyncStorage.getItem(STORAGE_KEY_PODCASTS),
      AsyncStorage.getItem(STORAGE_KEY_EPISODES),
    ]);

    let loadedPodcasts: Podcast[] | null = null;
    if (pRes.status === "fulfilled") {
      if (pRes.value == null) {
        loadedPodcasts = [];
      } else {
        try {
          loadedPodcasts = JSON.parse(pRes.value);
        } catch (e) {
          console.error("Failed to parse stored podcasts", e);
        }
      }
    } else {
      console.error("Failed to read stored podcasts", pRes.reason);
    }

    let loadedEpisodes: EpisodeMap | null = null;
    if (eRes.status === "fulfilled") {
      if (eRes.value == null) {
        loadedEpisodes = {};
      } else {
        try {
          loadedEpisodes = JSON.parse(eRes.value);
        } catch (e) {
          console.error("Failed to parse stored episodes", e);
        }
      }
    } else {
      console.error("Failed to read stored episodes", eRes.reason);
    }

    return { loadedPodcasts, loadedEpisodes };
  }, []);

  // Load state from disk and MERGE it into memory. Runs at launch and on
  // every foreground resume; on resume the disk snapshot may be older than
  // in-memory state (a subscription added moments ago) or newer (the
  // background task added episodes) — merging keeps both sides instead of
  // letting one clobber the other.
  const doHydrate = useCallback(async () => {
      let { loadedPodcasts, loadedEpisodes } = await loadFromStorage();

      // If AsyncStorage is unreadable or unexpectedly empty, fall back to the
      // file backup. A legitimately emptied library also has an empty backup
      // (it's rewritten on every persist), so this only resurrects data that
      // was lost, not data the user removed.
      const podcastsMissing = loadedPodcasts === null || loadedPodcasts.length === 0;
      const episodesMissing =
        loadedEpisodes === null || Object.keys(loadedEpisodes).length === 0;
      if (podcastsMissing || episodesMissing) {
        const backup = await readBackup();
        if (backup) {
          if (podcastsMissing && backup.podcasts.length > 0) {
            console.warn("Podcasts missing from storage — restoring from file backup");
            loadedPodcasts = backup.podcasts;
          }
          if (episodesMissing && Object.keys(backup.episodes).length > 0) {
            console.warn("Episodes missing from storage — restoring from file backup");
            loadedEpisodes = backup.episodes;
          }
        }
      }

      let mergedPodcasts: Podcast[] | null = null;
      if (loadedPodcasts !== null) {
        const disk = loadedPodcasts;
        const removed = removedPodcastIdsRef.current;
        // Idempotent merge, applied as a functional updater: a direct set
        // computed from the ref could clobber a concurrently queued update
        // (e.g. a subscription added while hydrate was awaiting the read).
        const mergeInto = (prev: Podcast[]): Podcast[] => {
          const prevIds = new Set(prev.map((p) => p.id));
          const diskOnly = disk.filter(
            (p) => !prevIds.has(p.id) && !removed.has(p.id)
          );
          return diskOnly.length > 0 ? [...prev, ...diskOnly] : prev;
        };
        // Synchronously merged copy so callers awaiting hydrate (the launch
        // refresh loop) see the hydrated list before React commits.
        mergedPodcasts = mergeInto(podcastsRef.current);
        podcastsRef.current = mergedPodcasts;
        podcastsHydratedRef.current = true;
        setPodcasts(mergeInto);
      }

      if (loadedEpisodes !== null) {
        const diskEpisodes = loadedEpisodes;
        const validIds = new Set(
          (mergedPodcasts ?? podcastsRef.current).map((p) => p.id)
        );
        episodesHydratedRef.current = true;
        setEpisodes((prev) => {
          let changed = false;
          const merged: EpisodeMap = { ...prev };
          for (const podcastId of Object.keys(diskEpisodes)) {
            if (!validIds.has(podcastId)) continue;
            const memEps = merged[podcastId];
            if (!memEps || memEps.length === 0) {
              merged[podcastId] = diskEpisodes[podcastId];
              changed = true;
              continue;
            }
            // Keep the in-memory episode objects (they carry the newest
            // downloadedPath/listenedAt) and only add disk-side episodes we
            // don't have.
            const mergedList = mergeEpisodeLists(memEps, diskEpisodes[podcastId]);
            if (mergedList) {
              merged[podcastId] = mergedList;
              changed = true;
            }
          }
          return changed ? merged : prev;
        });
      }
  }, [loadFromStorage]);

  // Concurrent callers (StrictMode double-mount, rapid resumes) share the
  // in-flight hydrate instead of being dropped: awaiting hydrate() must
  // always mean "hydration finished", never "someone else was hydrating".
  const hydrate = useCallback((): Promise<void> => {
    if (!hydratePromiseRef.current) {
      hydratePromiseRef.current = doHydrate().finally(() => {
        hydratePromiseRef.current = null;
      });
    }
    return hydratePromiseRef.current;
  }, [doHydrate]);

  // Re-attach downloaded audio files to their episode records. Download files
  // are named <episodeId>.mp3, so the local path can always be re-derived:
  // this recovers records whose downloadedPath was lost, heals absolute paths
  // broken by the iOS container UUID changing across app updates, and clears
  // paths whose file no longer exists (so playback falls back to streaming).
  const recoverDownloadState = useCallback(async () => {
    const dir = DOWNLOADS_DIR;
    if (!dir) return;
    try {
      // A missing directory (e.g. fresh reinstall with a restored backup)
      // means no downloads exist: fall through with an empty set so stale
      // downloadedPaths get cleared and playback streams instead.
      const info = await FileSystem.getInfoAsync(dir);
      const files = new Set(
        info.exists ? await FileSystem.readDirectoryAsync(dir) : []
      );
      setEpisodes((prev) => {
        let changed = false;
        const updated: EpisodeMap = {};
        for (const podcastId of Object.keys(prev)) {
          updated[podcastId] = prev[podcastId].map((ep) => {
            if (ep.isDownloading) return ep;
            if (files.has(ep.id + ".mp3")) {
              const expectedPath = dir + ep.id + ".mp3";
              if (ep.downloadedPath !== expectedPath) {
                changed = true;
                return { ...ep, downloadedPath: expectedPath };
              }
            } else if (ep.downloadedPath) {
              changed = true;
              return { ...ep, downloadedPath: undefined };
            }
            return ep;
          });
        }
        return changed ? updated : prev;
      });
    } catch (e) {
      console.error("Download recovery scan failed", e);
    }
  }, []);

  const backupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Serializes backup writes: writeBackup is a multi-step write/delete/move
  // sequence, so overlapping invocations (debounce timer firing while a
  // background-triggered flush is mid-write) must queue behind each other.
  const backupChainRef = useRef<Promise<void>>(Promise.resolve());
  const flushBackup = useCallback(() => {
    // Only mirror fully-hydrated state; a partial snapshot could clobber the
    // good copy in the backup file.
    if (!podcastsHydratedRef.current || !episodesHydratedRef.current) return;
    if (backupTimerRef.current) {
      clearTimeout(backupTimerRef.current);
      backupTimerRef.current = null;
    }
    backupChainRef.current = backupChainRef.current
      .then(() =>
        writeBackup({
          savedAt: Date.now(),
          podcasts: podcastsRef.current,
          episodes: sanitizeEpisodes(episodesRef.current),
        })
      )
      .catch((e) => console.error("Failed to write library backup", e));
  }, []);

  const scheduleBackup = useCallback(() => {
    if (!podcastsHydratedRef.current || !episodesHydratedRef.current) return;
    if (backupTimerRef.current) clearTimeout(backupTimerRef.current);
    backupTimerRef.current = setTimeout(flushBackup, 1000);
  }, [flushBackup]);

  const refreshFeed = useCallback(
    async (podcastId: string) => {
      const podcast = podcastsRef.current.find((p) => p.id === podcastId);
      if (!podcast) return;
      const { episodes: eps } = await parseFeed(podcast.feedUrl);
      setEpisodes((prev) => {
        const existingEps = prev[podcastId] || [];
        const newEpisodes: Episode[] = filterNewEpisodes(existingEps, eps).map(
          (ep) => ({ ...ep, id: generateId(), podcastId })
        );
        if (newEpisodes.length === 0) return prev;
        return { ...prev, [podcastId]: [...newEpisodes, ...existingEps] };
      });
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await hydrate();
      } catch (e) {
        console.error("Failed to load data", e);
      } finally {
        setIsLoading(false);
      }
      await recoverDownloadState();
      // Refresh feeds through hydrated state. This replaces the old
      // refreshAllFeeds() call at launch, which raced the provider: it wrote
      // a stale snapshot straight to AsyncStorage after a long network fetch
      // and could clobber newer data.
      for (const podcast of podcastsRef.current) {
        if (cancelled) return;
        try {
          await refreshFeed(podcast.id);
        } catch (e) {
          console.error("Launch refresh failed for", podcast.title, e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrate, recoverDownloadState, refreshFeed]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        hydrate().catch((e) =>
          console.error("Failed to reload data on resume", e)
        );
      } else if (state === "background" && backupTimerRef.current) {
        // Flush a pending backup before the OS can kill us.
        flushBackup();
      }
    });
    return () => sub.remove();
  }, [hydrate, flushBackup]);

  // Persist on change rather than from inside state updaters. Gated on
  // per-key hydration so the empty initial state is never written over loaded
  // data, and safe under StrictMode/React Compiler (which may invoke updaters
  // twice). Skipping unchanged payloads avoids re-serializing/writing the
  // whole map on every download progress tick.
  const lastPodcastsJsonRef = useRef<string | null>(null);
  useEffect(() => {
    if (!podcastsHydratedRef.current) return;
    const json = JSON.stringify(podcasts);
    if (json === lastPodcastsJsonRef.current) return;
    lastPodcastsJsonRef.current = json;
    AsyncStorage.setItem(STORAGE_KEY_PODCASTS, json).catch((e) =>
      console.error("Failed to persist podcasts", e)
    );
    scheduleBackup();
  }, [podcasts, scheduleBackup]);

  const lastEpisodesJsonRef = useRef<string | null>(null);
  useEffect(() => {
    if (!episodesHydratedRef.current) return;
    const json = JSON.stringify(sanitizeEpisodes(episodes));
    if (json === lastEpisodesJsonRef.current) return;
    lastEpisodesJsonRef.current = json;
    AsyncStorage.setItem(STORAGE_KEY_EPISODES, json).catch((e) =>
      console.error("Failed to persist episodes", e)
    );
    scheduleBackup();
  }, [episodes, scheduleBackup]);

  const addPodcast = useCallback(
    async (feedUrl: string) => {
      const { podcast, episodes: eps } = await parseFeed(feedUrl);
      const id = generateId();
      const newPodcast: Podcast = { ...podcast, id, subscribedAt: Date.now() };
      const newEpisodes: Episode[] = eps.map((ep) => ({
        ...ep,
        id: generateId(),
        podcastId: id,
      }));

      setPodcasts((prev) => [...prev, newPodcast]);
      setEpisodes((prev) => ({ ...prev, [id]: newEpisodes }));
    },
    []
  );

  const removePodcast = useCallback((id: string) => {
    removedPodcastIdsRef.current.add(id);
    setPodcasts((prev) => prev.filter((p) => p.id !== id));
    setEpisodes((prev) => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  }, []);

  const updateEpisode = useCallback(
    (episodeId: string, updates: Partial<Episode>) => {
      setEpisodes((prev) => {
        const updated = { ...prev };
        let found = false;
        for (const podcastId of Object.keys(updated)) {
          const idx = updated[podcastId].findIndex((e) => e.id === episodeId);
          if (idx !== -1) {
            updated[podcastId] = [...updated[podcastId]];
            updated[podcastId][idx] = { ...updated[podcastId][idx], ...updates };
            found = true;
            break;
          }
        }
        // Don't churn state (or trigger a persist) when nothing matched —
        // avoids re-rendering for an episode we don't hold.
        if (!found) return prev;
        return updated;
      });
    },
    []
  );

  const downloadEpisode = useCallback(
    async (episode: Episode) => {
      const dir = DOWNLOADS_DIR;
      if (!dir) return;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const filename = episode.id + ".mp3";
      const localUri = dir + filename;

      updateEpisode(episode.id, { isDownloading: true, downloadProgress: 0 });

      const downloadResumable = FileSystem.createDownloadResumable(
        episode.audioUrl,
        localUri,
        {},
        (progress) => {
          const pct = progress.totalBytesWritten / (progress.totalBytesExpectedToWrite || 1);
          updateEpisode(episode.id, { downloadProgress: pct });
        }
      );

      downloadTasksRef.current[episode.id] = downloadResumable;

      try {
        const result = await downloadResumable.downloadAsync();
        if (result) {
          updateEpisode(episode.id, {
            downloadedPath: result.uri,
            isDownloading: false,
            downloadProgress: 1,
          });
        }
      } catch (e) {
        console.error("Download failed", e);
        updateEpisode(episode.id, { isDownloading: false, downloadProgress: undefined });
      } finally {
        delete downloadTasksRef.current[episode.id];
      }
    },
    [updateEpisode]
  );

  const deleteDownload = useCallback(
    (episodeId: string) => {
      setEpisodes((prev) => {
        const updated = { ...prev };
        for (const podcastId of Object.keys(updated)) {
          const idx = updated[podcastId].findIndex((e) => e.id === episodeId);
          if (idx !== -1) {
            const ep = updated[podcastId][idx];
            if (ep.downloadedPath) {
              FileSystem.deleteAsync(ep.downloadedPath, { idempotent: true }).catch(console.error);
            }
            updated[podcastId] = [...updated[podcastId]];
            updated[podcastId][idx] = {
              ...updated[podcastId][idx],
              downloadedPath: undefined,
              downloadProgress: undefined,
            };
            break;
          }
        }
        return updated;
      });
    },
    []
  );

  const getEpisodesByPodcast = useCallback(
    (podcastId: string) => episodes[podcastId] || [],
    [episodes]
  );

  const getDownloadedEpisodes = useCallback(() => {
    return Object.values(episodes)
      .flat()
      .filter((e) => !!e.downloadedPath);
  }, [episodes]);

  const value = useMemo(
    () => ({
      podcasts,
      episodes,
      isLoading,
      addPodcast,
      removePodcast,
      refreshFeed,
      downloadEpisode,
      deleteDownload,
      getEpisodesByPodcast,
      getDownloadedEpisodes,
      updateEpisode,
    }),
    [
      podcasts,
      episodes,
      isLoading,
      addPodcast,
      removePodcast,
      refreshFeed,
      downloadEpisode,
      deleteDownload,
      getEpisodesByPodcast,
      getDownloadedEpisodes,
      updateEpisode,
    ]
  );

  return <PodcastContext.Provider value={value}>{children}</PodcastContext.Provider>;
}

export function usePodcasts() {
  const ctx = useContext(PodcastContext);
  if (!ctx) throw new Error("usePodcasts must be used within PodcastProvider");
  return ctx;
}
