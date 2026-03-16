import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Collapsible } from "@/components/Collapsible";
import { EpisodeRow } from "@/components/EpisodeRow";
import { MiniPlayer } from "@/components/MiniPlayer";
import Colors from "@/constants/colors";
import { usePodcasts } from "@/context/PodcastContext";
import { usePlayer } from "@/context/PlayerContext";

export default function PodcastScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { podcasts, getEpisodesByPodcast, downloadEpisode, deleteDownload, refreshFeed } =
    usePodcasts();
  const { currentEpisode, playEpisode } = usePlayer();
  const [refreshing, setRefreshing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const toggleDetails = useCallback(() => {
    setShowDetails((prev) => !prev);
  }, []);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const podcast = podcasts.find((p) => p.id === id);
  const episodes = getEpisodesByPodcast(id ?? "");

  const handleRefresh = async () => {
    if (!id) return;
    setRefreshing(true);
    try {
      await refreshFeed(id);
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  const handleEpisodePress = (episodeId: string) => {
    const ep = episodes.find((e) => e.id === episodeId);
    if (ep) {
      if (ep.downloadedPath) {
        playEpisode(ep);
        router.push("/player");
      } else {
        Alert.alert(
          "Stream or Download",
          "This episode isn't downloaded. Would you like to stream it or download it first?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Download",
              onPress: () => downloadEpisode(ep),
            },
            {
              text: "Stream",
              onPress: () => {
                playEpisode(ep);
                router.push("/player");
              },
            },
          ]
        );
      }
    }
  };

  const handleDownload = (episodeId: string) => {
    const ep = episodes.find((e) => e.id === episodeId);
    if (!ep) return;
    if (ep.downloadedPath) {
      Alert.alert("Delete Download", "Remove this episode from your device?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            deleteDownload(episodeId);
          },
        },
      ]);
    } else if (!ep.isDownloading) {
      downloadEpisode(ep);
    }
  };

  if (!podcast) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.notFound, { paddingTop: topPad + 60 }]}>
          <Text style={[styles.notFoundText, { color: theme.text, fontFamily: "Inter_500Medium" }]}>
            Podcast not found
          </Text>
          <Pressable onPress={() => router.back()}>
            <Text style={[styles.backLink, { color: Colors.primary }]}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={episodes}
        keyExtractor={(item) => item.id}
        scrollEnabled={!!episodes.length}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
        contentContainerStyle={[
          styles.list,
          { paddingBottom: currentEpisode ? 90 + bottomPad : 24 + bottomPad },
        ]}
        renderItem={({ item }) => (
          <EpisodeRow
            episode={item}
            onPress={() => handleEpisodePress(item.id)}
            onDownload={() => handleDownload(item.id)}
            isPlaying={currentEpisode?.id === item.id}
          />
        )}
        ListHeaderComponent={
          <View>
            <View style={[styles.hero, { paddingTop: topPad }]}>
              <View style={styles.heroOverlay}>
                <Pressable
                  onPress={() => router.back()}
                  style={({ pressed }) => [
                    styles.backBtn,
                    { backgroundColor: "rgba(0,0,0,0.4)", opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Feather name="chevron-left" size={24} color="#fff" />
                </Pressable>
              </View>
              {podcast.imageUrl ? (
                <Image
                  source={{ uri: podcast.imageUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  blurRadius={20}
                />
              ) : null}
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.45)" }]} />
              <View style={styles.heroContent}>
                {podcast.imageUrl ? (
                  <Image
                    source={{ uri: podcast.imageUrl }}
                    style={styles.heroImage}
                    contentFit="cover"
                    transition={300}
                  />
                ) : (
                  <View style={[styles.heroImagePlaceholder, { backgroundColor: theme.cardElevated }]}>
                    <Feather name="mic" size={48} color={Colors.primary} />
                  </View>
                )}
                <View style={styles.heroText}>
                  <Text
                    style={[styles.heroTitle, { fontFamily: "Inter_700Bold" }]}
                    numberOfLines={2}
                  >
                    {podcast.title}
                  </Text>
                  {podcast.author ? (
                    <Text
                      style={[styles.heroAuthor, { fontFamily: "Inter_400Regular" }]}
                      numberOfLines={1}
                    >
                      {podcast.author}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>

            {podcast.description ? (
              <View style={[styles.descSection, { borderBottomColor: theme.border }]}>
                <Collapsible expanded={showDetails} collapsedHeight={66}>
                  <Text style={[styles.description, { color: theme.textSecondary, fontFamily: "Inter_400Regular" }]}>
                    {podcast.description}
                  </Text>
                </Collapsible>
                <Collapsible expanded={showDetails}>
                  <View style={styles.detailsContainer}>
                    {podcast.author ? (
                      <View style={styles.detailRow}>
                        <Feather name="user" size={14} color={theme.textTertiary} />
                        <Text style={[styles.detailText, { color: theme.textSecondary, fontFamily: "Inter_400Regular" }]}>
                          {podcast.author}
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.detailRow}>
                      <Feather name="list" size={14} color={theme.textTertiary} />
                      <Text style={[styles.detailText, { color: theme.textSecondary, fontFamily: "Inter_400Regular" }]}>
                        {episodes.length} episode{episodes.length !== 1 ? "s" : ""}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Feather name="rss" size={14} color={theme.textTertiary} />
                      <Text
                        style={[styles.detailText, { color: theme.textSecondary, fontFamily: "Inter_400Regular" }]}
                        numberOfLines={1}
                      >
                        {podcast.feedUrl}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Feather name="calendar" size={14} color={theme.textTertiary} />
                      <Text style={[styles.detailText, { color: theme.textSecondary, fontFamily: "Inter_400Regular" }]}>
                        Subscribed {new Date(podcast.subscribedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </Text>
                    </View>
                  </View>
                </Collapsible>
                <Pressable onPress={toggleDetails} style={styles.showMoreBtn} hitSlop={8}>
                  <Text style={[styles.showMoreText, { color: Colors.primary, fontFamily: "Inter_500Medium" }]}>
                    {showDetails ? "Show less" : "Show more"}
                  </Text>
                  <Feather name={showDetails ? "chevron-up" : "chevron-down"} size={14} color={Colors.primary} />
                </Pressable>
              </View>
            ) : null}

            <View style={[styles.episodesHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.episodesTitle, { color: theme.text, fontFamily: "Inter_600SemiBold" }]}>
                Episodes
              </Text>
              <Text style={[styles.episodesCount, { color: theme.textTertiary, fontFamily: "Inter_400Regular" }]}>
                {episodes.length}
              </Text>
            </View>

            {episodes.length === 0 && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={Colors.primary} />
                <Text style={[styles.loadingText, { color: theme.textSecondary, fontFamily: "Inter_400Regular" }]}>
                  Loading episodes...
                </Text>
              </View>
            )}
          </View>
        }
      />

      {currentEpisode && (
        <View style={[styles.miniPlayerContainer, { paddingBottom: bottomPad || insets.bottom + 60 }]}>
          <MiniPlayer />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hero: {
    minHeight: 240,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  heroOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  heroContent: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 20,
    gap: 16,
  },
  heroImage: {
    width: 100,
    height: 100,
    borderRadius: 14,
  },
  heroImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: {
    flex: 1,
    gap: 6,
  },
  heroTitle: {
    fontSize: 22,
    color: "#fff",
    lineHeight: 28,
  },
  heroAuthor: {
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
  },
  descSection: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  description: {
    fontSize: 14,
    lineHeight: 22,
  },
  detailsContainer: {
    marginTop: 12,
    gap: 8,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  showMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
  },
  showMoreText: {
    fontSize: 13,
  },
  episodesHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  episodesTitle: {
    fontSize: 18,
  },
  episodesCount: {
    fontSize: 14,
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  list: {
    paddingTop: 0,
  },
  notFound: {
    flex: 1,
    alignItems: "center",
    gap: 12,
  },
  notFoundText: {
    fontSize: 18,
  },
  backLink: {
    fontSize: 15,
  },
  miniPlayerContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
});
