import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { Collapsible } from "@/components/Collapsible";
import Colors from "@/constants/colors";
import { Episode } from "@/context/PodcastContext";
import { htmlToText } from "@/utils/htmlToText";

interface EpisodeRowProps {
  episode: Episode;
  onPress: () => void;
  onDownload: () => void;
  isPlaying?: boolean;
}

function formatDuration(seconds: number): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatFileSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export function EpisodeRow({ episode, onPress, onDownload, isPlaying }: EpisodeRowProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? Colors.dark : Colors.light;
  const scale = useSharedValue(1);
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSpring(0.97, { duration: 100 }, () => {
      scale.value = withSpring(1);
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const handleDownload = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDownload();
  };

  const isDownloaded = !!episode.downloadedPath;
  const isDownloading = !!episode.isDownloading;
  const progress = episode.downloadProgress ?? 0;

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={handlePress}
        style={[styles.container, { borderBottomColor: theme.border }]}
      >
        {episode.imageUrl ? (
          <Image
            source={{ uri: episode.imageUrl }}
            style={styles.thumbnail}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.thumbnailPlaceholder, { backgroundColor: theme.cardElevated }]}>
            <Feather name="headphones" size={20} color={Colors.primary} />
          </View>
        )}

        <View style={styles.content}>
          <View style={styles.metaRow}>
            <Text style={[styles.date, { color: theme.textTertiary, fontFamily: "Inter_400Regular" }]}>
              {formatDate(episode.publishedAt)}
            </Text>
            {isPlaying && (
              <View style={[styles.playingBadge, { backgroundColor: Colors.primary + "20" }]}>
                <View style={[styles.playingDot, { backgroundColor: Colors.primary }]} />
                <Text style={[styles.playingText, { color: Colors.primary, fontFamily: "Inter_500Medium" }]}>
                  Playing
                </Text>
              </View>
            )}
          </View>
          <Text
            style={[styles.title, { color: theme.text, fontFamily: "Inter_500Medium" }]}
            numberOfLines={2}
          >
            {episode.title}
          </Text>
          <View style={styles.footerRow}>
            {episode.duration > 0 && (
              <Text style={[styles.duration, { color: theme.textSecondary, fontFamily: "Inter_400Regular" }]}>
                {formatDuration(episode.duration)}
              </Text>
            )}
            <Pressable onPress={handleDownload} style={styles.downloadBtn} hitSlop={8}>
              {isDownloading ? (
                <View style={styles.progressContainer}>
                  <View style={[styles.progressTrack, { backgroundColor: theme.cardElevated }]}>
                    <View style={[styles.progressFill, { backgroundColor: Colors.primary, flex: progress }]} />
                    <View style={{ flex: Math.max(0, 1 - progress) }} />
                  </View>
                  <Text style={[styles.progressText, { color: Colors.primary, fontFamily: "Inter_500Medium" }]}>
                    {Math.round(progress * 100)}%
                  </Text>
                </View>
              ) : isDownloaded ? (
                <View style={styles.downloadedIndicator}>
                  <Feather name="check-circle" size={18} color={Colors.primary} />
                </View>
              ) : (
                <View style={[styles.downloadIcon, { backgroundColor: theme.cardElevated }]}>
                  <Feather name="download" size={16} color={theme.textSecondary} />
                </View>
              )}
            </Pressable>
          </View>

          {episode.description ? (
            <View style={styles.expandedSection}>
              <Collapsible expanded={expanded} collapsedHeight={40}>
                <Text style={[styles.episodeDescription, { color: theme.textSecondary, fontFamily: "Inter_400Regular" }]}>
                  {htmlToText(episode.description)}
                </Text>
              </Collapsible>
              <Collapsible expanded={expanded}>
                {episode.fileSize > 0 ? (
                  <View style={styles.episodeDetailRow}>
                    <Feather name="hard-drive" size={13} color={theme.textTertiary} />
                    <Text style={[styles.episodeDetailText, { color: theme.textTertiary, fontFamily: "Inter_400Regular" }]}>
                      {formatFileSize(episode.fileSize)}
                    </Text>
                  </View>
                ) : <View />}
              </Collapsible>
            </View>
          ) : null}

          {episode.description ? (
            <Pressable onPress={toggleExpanded} style={styles.showMoreBtn} hitSlop={4}>
              <Text style={[styles.showMoreText, { color: Colors.primary, fontFamily: "Inter_500Medium" }]}>
                {expanded ? "Show less" : "Show more"}
              </Text>
              <Feather name={expanded ? "chevron-up" : "chevron-down"} size={13} color={Colors.primary} />
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: "flex-start",
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: 10,
    flexShrink: 0,
  },
  thumbnailPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  content: {
    flex: 1,
    gap: 5,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  date: {
    fontSize: 12,
  },
  playingBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 4,
  },
  playingDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  playingText: {
    fontSize: 11,
  },
  title: {
    fontSize: 14,
    lineHeight: 20,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  duration: {
    fontSize: 12,
  },
  downloadBtn: {
    alignItems: "center",
    justifyContent: "center",
  },
  downloadIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  downloadedIndicator: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 60,
  },
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
    width: 40,
    flexDirection: "row",
    overflow: "hidden",
  },
  progressFill: {
    height: 3,
    borderRadius: 1.5,
    minWidth: 2,
  },
  progressText: {
    fontSize: 11,
  },
  expandedSection: {
    marginTop: 6,
    gap: 8,
  },
  episodeDescription: {
    fontSize: 13,
    lineHeight: 20,
  },
  episodeDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  episodeDetailText: {
    fontSize: 12,
  },
  showMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
  },
  showMoreText: {
    fontSize: 12,
  },
});
