import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { parseFeed } from "@/modules/feed-parser/src";
import type { Episode, Podcast } from "@/context/PodcastContext";

const TASK_NAME = "REFRESH_FEEDS";

const STORAGE_KEY_PODCASTS = "@podcast_app/podcasts";
const STORAGE_KEY_EPISODES = "@podcast_app/episodes";

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export async function refreshAllFeeds() {
  const podcastsStr = await AsyncStorage.getItem(STORAGE_KEY_PODCASTS);
  const episodesStr = await AsyncStorage.getItem(STORAGE_KEY_EPISODES);
  if (!podcastsStr) return;

  const podcasts: Podcast[] = JSON.parse(podcastsStr);
  const allEpisodes: Record<string, Episode[]> = episodesStr
    ? JSON.parse(episodesStr)
    : {};

  let changed = false;

  for (const podcast of podcasts) {
    try {
      const feed = await parseFeed(podcast.feedUrl);
      const existingEps = allEpisodes[podcast.id] || [];
      const existingUrls = new Set(existingEps.map((e) => e.audioUrl));
      const newEpisodes: Episode[] = feed.episodes
        .filter((ep) => !existingUrls.has(ep.audioUrl))
        .map((ep) => ({ ...ep, id: generateId(), podcastId: podcast.id }));
      if (newEpisodes.length > 0) {
        allEpisodes[podcast.id] = [...newEpisodes, ...existingEps];
        changed = true;
      }
    } catch (e) {
      console.error("Background refresh failed for", podcast.id, e);
    }
  }

  if (changed) {
    await AsyncStorage.setItem(STORAGE_KEY_EPISODES, JSON.stringify(allEpisodes));
  }
}

// Define task at top-level module scope
TaskManager.defineTask(TASK_NAME, async () => {
  try {
    await refreshAllFeeds();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.error("Background feed refresh failed:", error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerFeedRefreshTask() {
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    console.warn("Background tasks not available, status:", status);
    return;
  }

  const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
  if (!isRegistered) {
    await BackgroundTask.registerTaskAsync(TASK_NAME, {
      minimumInterval: 60, // ~60 minutes
    });
  }
}