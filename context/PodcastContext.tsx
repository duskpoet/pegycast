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

interface PodcastContextValue {
  podcasts: Podcast[];
  episodes: Record<string, Episode[]>;
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

export function PodcastProvider({ children }: { children: ReactNode }) {
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [episodes, setEpisodes] = useState<Record<string, Episode[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const downloadTasksRef = useRef<Record<string, FileSystem.DownloadResumable>>({});
  const podcastsRef = useRef(podcasts);
  podcastsRef.current = podcasts;
  // Guards against persisting in-memory state before the initial load has
  // populated it. Without this, an early mutation (e.g. the player marking the
  // restored episode as listened) would write the empty initial state back to
  // disk and wipe the stored podcasts/episodes.
  const hydratedRef = useRef(false);

  const loadFromStorage = useCallback(async () => {
    const [podcastsStr, episodesStr] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY_PODCASTS),
      AsyncStorage.getItem(STORAGE_KEY_EPISODES),
    ]);
    // Parse each key independently so a single corrupt value can't blank
    // everything (and can't throw past the hydration flag below).
    if (podcastsStr) {
      try {
        setPodcasts(JSON.parse(podcastsStr));
      } catch (e) {
        console.error("Failed to parse stored podcasts", e);
      }
    }
    if (episodesStr) {
      try {
        setEpisodes(JSON.parse(episodesStr));
      } catch (e) {
        console.error("Failed to parse stored episodes", e);
      }
    }
  }, []);

  useEffect(() => {
    loadFromStorage()
      .catch((e) => console.error("Failed to load data", e))
      .finally(() => {
        hydratedRef.current = true;
        setIsLoading(false);
      });
  }, [loadFromStorage]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        loadFromStorage().catch((e) =>
          console.error("Failed to reload data on resume", e)
        );
      }
    });
    return () => sub.remove();
  }, [loadFromStorage]);

  // Persist on change rather than from inside state updaters. Gated on
  // hydration so the empty initial state is never written over loaded data,
  // and safe under StrictMode/React Compiler (which may invoke updaters twice).
  const lastPodcastsJsonRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hydratedRef.current) return;
    const json = JSON.stringify(podcasts);
    if (json === lastPodcastsJsonRef.current) return;
    lastPodcastsJsonRef.current = json;
    AsyncStorage.setItem(STORAGE_KEY_PODCASTS, json).catch((e) =>
      console.error("Failed to persist podcasts", e)
    );
  }, [podcasts]);

  const lastEpisodesJsonRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hydratedRef.current) return;
    // Strip in-flight download fields — they're meaningless across launches
    // (a download can't resume after a kill) and would otherwise leave an
    // episode stuck showing "downloading". Skipping unchanged payloads also
    // avoids re-serializing/writing the whole map on every progress tick.
    const sanitized: Record<string, Episode[]> = {};
    for (const podcastId of Object.keys(episodes)) {
      sanitized[podcastId] = episodes[podcastId].map(
        ({ isDownloading, downloadProgress, ...rest }) => rest
      );
    }
    const json = JSON.stringify(sanitized);
    if (json === lastEpisodesJsonRef.current) return;
    lastEpisodesJsonRef.current = json;
    AsyncStorage.setItem(STORAGE_KEY_EPISODES, json).catch((e) =>
      console.error("Failed to persist episodes", e)
    );
  }, [episodes]);

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
    setPodcasts((prev) => prev.filter((p) => p.id !== id));
    setEpisodes((prev) => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  }, []);

  const refreshFeed = useCallback(
    async (podcastId: string) => {
      const podcast = podcastsRef.current.find((p) => p.id === podcastId);
      if (!podcast) return;
      const { episodes: eps } = await parseFeed(podcast.feedUrl);
      setEpisodes((prev) => {
        const existingEps = prev[podcastId] || [];
        const existingUrls = new Set(existingEps.map((e) => e.audioUrl));
        const newEpisodes: Episode[] = eps
          .filter((ep) => !existingUrls.has(ep.audioUrl))
          .map((ep) => ({ ...ep, id: generateId(), podcastId }));
        if (newEpisodes.length === 0) return prev;
        return { ...prev, [podcastId]: [...newEpisodes, ...existingEps] };
      });
    },
    []
  );


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
      const dir = FileSystem.documentDirectory + "podcasts/";
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
