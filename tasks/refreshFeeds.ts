import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { XMLParser } from "fast-xml-parser";
import { htmlToText } from "@/utils/htmlToText";
import type { Episode, Podcast } from "@/context/PodcastContext";

const TASK_NAME = "REFRESH_FEEDS";

const STORAGE_KEY_PODCASTS = "@podcast_app/podcasts";
const STORAGE_KEY_EPISODES = "@podcast_app/episodes";

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function parseDuration(duration: string | number): number {
  if (typeof duration === "number") return duration;
  if (!duration) return 0;
  const parts = duration.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parseInt(duration, 10) || 0;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  isArray: (name) => name === "item",
  processEntities: false,
});

function str(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && "#text" in (value as Record<string, unknown>))
    return str((value as Record<string, unknown>)["#text"]);
  return "";
}

async function parseFeed(feedUrl: string) {
  const response = await fetch(feedUrl);
  const xml = await response.text();
  const parsed = xmlParser.parse(xml);
  const channel = parsed?.rss?.channel ?? parsed?.feed ?? {};

  const itunesImage = channel["itunes:image"];
  const channelImage = channel.image;
  const imageUrl =
    (itunesImage ? str(itunesImage["@_href"]) || str(itunesImage) : "") ||
    (channelImage ? str(channelImage.url) || str(channelImage["@_href"]) : "") ||
    "";

  const items: unknown[] = Array.isArray(channel.item)
    ? channel.item
    : channel.item
      ? [channel.item]
      : [];

  const episodes: Omit<
    Episode,
    "id" | "podcastId" | "downloadedPath" | "downloadProgress" | "isDownloading"
  >[] = [];

  for (const item of items.slice(0, 50) as Record<string, unknown>[]) {
    const enclosure = item.enclosure as Record<string, unknown> | undefined;
    const audioUrl = enclosure ? str(enclosure["@_url"]) : "";
    if (!audioUrl) continue;

    const epTitle = str(item.title) || "Untitled";
    const epDescription = htmlToText(
      str(item.description) || str(item["itunes:summary"]) || ""
    );
    const pubDateStr = str(item.pubDate);
    const publishedAt = pubDateStr ? new Date(pubDateStr).getTime() : Date.now();
    const fileSize = enclosure
      ? parseInt(str(enclosure["@_length"]), 10) || 0
      : 0;
    const duration = parseDuration(str(item["itunes:duration"]));

    const epItunesImage = item["itunes:image"] as Record<string, unknown> | undefined;
    const epImageUrl = epItunesImage
      ? str(epItunesImage["@_href"]) || str(epItunesImage)
      : imageUrl;

    episodes.push({
      title: epTitle,
      description: epDescription,
      audioUrl,
      imageUrl: epImageUrl,
      publishedAt,
      duration,
      fileSize,
    });
  }

  return episodes;
}

async function refreshAllFeeds() {
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
      const eps = await parseFeed(podcast.feedUrl);
      const existingEps = allEpisodes[podcast.id] || [];
      const existingUrls = new Set(existingEps.map((e) => e.audioUrl));
      const newEpisodes: Episode[] = eps
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