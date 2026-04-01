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

  useEffect(() => {
    const load = async () => {
      try {
        const [podcastsStr, episodesStr] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_PODCASTS),
          AsyncStorage.getItem(STORAGE_KEY_EPISODES),
        ]);
        if (podcastsStr) setPodcasts(JSON.parse(podcastsStr));
        if (episodesStr) setEpisodes(JSON.parse(episodesStr));
      } catch (e) {
        console.error("Failed to load data", e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const savePodcasts = useCallback(async (data: Podcast[]) => {
    await AsyncStorage.setItem(STORAGE_KEY_PODCASTS, JSON.stringify(data));
  }, []);

  const saveEpisodes = useCallback(async (data: Record<string, Episode[]>) => {
    await AsyncStorage.setItem(STORAGE_KEY_EPISODES, JSON.stringify(data));
  }, []);

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

      setPodcasts((prev) => {
        const updated = [...prev, newPodcast];
        savePodcasts(updated);
        return updated;
      });
      setEpisodes((prev) => {
        const updated = { ...prev, [id]: newEpisodes };
        saveEpisodes(updated);
        return updated;
      });
    },
    [savePodcasts, saveEpisodes]
  );

  const removePodcast = useCallback(
    (id: string) => {
      setPodcasts((prev) => {
        const updated = prev.filter((p) => p.id !== id);
        savePodcasts(updated);
        return updated;
      });
      setEpisodes((prev) => {
        const updated = { ...prev };
        delete updated[id];
        saveEpisodes(updated);
        return updated;
      });
    },
    [savePodcasts, saveEpisodes]
  );

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
        const updatedEps = { ...prev, [podcastId]: [...newEpisodes, ...existingEps] };
        saveEpisodes(updatedEps);
        return updatedEps;
      });
    },
    [saveEpisodes]
  );


  const updateEpisode = useCallback(
    (episodeId: string, updates: Partial<Episode>) => {
      setEpisodes((prev) => {
        const updated = { ...prev };
        for (const podcastId of Object.keys(updated)) {
          const idx = updated[podcastId].findIndex((e) => e.id === episodeId);
          if (idx !== -1) {
            updated[podcastId] = [...updated[podcastId]];
            updated[podcastId][idx] = { ...updated[podcastId][idx], ...updates };
            break;
          }
        }
        saveEpisodes(updated);
        return updated;
      });
    },
    [saveEpisodes]
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
        saveEpisodes(updated);
        return updated;
      });
    },
    [saveEpisodes]
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
