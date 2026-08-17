import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { parseFeed } from "@/modules/feed-parser/src";
import type { Episode, Podcast } from "@/context/PodcastContext";
import { filterNewEpisodes, mergeEpisodeLists } from "@/utils/episodes";

const TASK_NAME = "REFRESH_FEEDS";

const STORAGE_KEY_PODCASTS = "@podcast_app/podcasts";
const STORAGE_KEY_EPISODES = "@podcast_app/episodes";

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export async function refreshAllFeeds() {
  // Hard rule: this function must never write unless it successfully read the
  // current state first. Any read/parse failure aborts — the foreground app
  // owns recovery (it has the file backup); overwriting here could destroy
  // data that is merely temporarily unreadable.
  let podcastsStr: string | null;
  let episodesStr: string | null;
  try {
    podcastsStr = await AsyncStorage.getItem(STORAGE_KEY_PODCASTS);
    episodesStr = await AsyncStorage.getItem(STORAGE_KEY_EPISODES);
  } catch (e) {
    console.error("refreshAllFeeds: storage read failed, aborting", e);
    return;
  }
  if (!podcastsStr) return;

  let podcasts: Podcast[];
  let allEpisodes: Record<string, Episode[]> = {};
  try {
    podcasts = JSON.parse(podcastsStr);
    if (episodesStr) allEpisodes = JSON.parse(episodesStr);
  } catch (e) {
    console.error("refreshAllFeeds: stored data unparseable, aborting", e);
    return;
  }

  // Collect new episodes per podcast without touching the snapshot — the
  // snapshot goes stale while the feeds download.
  const newByPodcast: Record<string, Episode[]> = {};
  for (const podcast of podcasts) {
    try {
      const feed = await parseFeed(podcast.feedUrl);
      const existing = allEpisodes[podcast.id] || [];
      const fresh: Episode[] = filterNewEpisodes(existing, feed.episodes).map(
        (ep) => ({ ...ep, id: generateId(), podcastId: podcast.id })
      );
      if (fresh.length > 0) newByPodcast[podcast.id] = fresh;
    } catch (e) {
      console.error("Background refresh failed for", podcast.id, e);
    }
  }

  if (Object.keys(newByPodcast).length === 0) return;

  // Merge the additions into a FRESH read of the store. The app may have
  // persisted new state (downloads, listened flags, new subscriptions,
  // removals) while the feeds were downloading; writing the stale snapshot
  // back would erase it.
  try {
    const [freshPodcastsStr, freshEpisodesStr] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY_PODCASTS),
      AsyncStorage.getItem(STORAGE_KEY_EPISODES),
    ]);
    const freshPodcasts: Podcast[] = freshPodcastsStr
      ? JSON.parse(freshPodcastsStr)
      : [];
    const validIds = new Set(freshPodcasts.map((p) => p.id));
    const freshEpisodes: Record<string, Episode[]> = freshEpisodesStr
      ? JSON.parse(freshEpisodesStr)
      : {};

    let changed = false;
    for (const [podcastId, newEps] of Object.entries(newByPodcast)) {
      // Skip podcasts the user removed while feeds were downloading.
      if (!validIds.has(podcastId)) continue;
      const merged = mergeEpisodeLists(freshEpisodes[podcastId] || [], newEps);
      if (merged) {
        freshEpisodes[podcastId] = merged;
        changed = true;
      }
    }
    if (changed) {
      await AsyncStorage.setItem(
        STORAGE_KEY_EPISODES,
        JSON.stringify(freshEpisodes)
      );
    }
  } catch (e) {
    console.error("refreshAllFeeds: merge/write failed", e);
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
