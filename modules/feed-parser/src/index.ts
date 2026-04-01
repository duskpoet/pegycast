import { requireNativeModule } from "expo-modules-core";

interface ParsedEpisode {
  title: string;
  description: string;
  audioUrl: string;
  imageUrl: string;
  publishedAt: number;
  duration: number;
  fileSize: number;
}

interface ParsedFeed {
  title: string;
  description: string;
  author: string;
  imageUrl: string;
  episodes: ParsedEpisode[];
}

interface FeedParserNativeModule {
  parseFeed(feedUrl: string): Promise<ParsedFeed>;
}

const nativeModule =
  requireNativeModule<FeedParserNativeModule>("FeedParser");

export function parseFeed(feedUrl: string): Promise<ParsedFeed> {
  return nativeModule.parseFeed(feedUrl);
}

export type { ParsedFeed, ParsedEpisode };