import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MiniPlayer } from "@/components/MiniPlayer";
import Colors from "@/constants/colors";
import { Episode, usePodcasts } from "@/context/PodcastContext";
import { usePlayer } from "@/context/PlayerContext";

function formatDuration(seconds: number): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function DownloadedEpisodeCard({ episode }: { episode: Episode }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? Colors.dark : Colors.light;
  const { deleteDownload, podcasts } = usePodcasts();
  const { playEpisode, currentEpisode, isPlaying } = usePlayer();

  const podcast = podcasts.find((p) => p.id === episode.podcastId);
  const isCurrent = currentEpisode?.id === episode.id;

  const handlePlay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isCurrent) {
      router.push("/player");
    } else {
      playEpisode(episode);
    }
  };

  const handleDelete = () => {
    Alert.alert("Delete Download", "Remove this episode from your downloads?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          deleteDownload(episode.id);
        },
      },
    ]);
  };

  return (
    <Pressable
      onPress={handlePlay}
      style={({ pressed }) => [
        styles.episodeCard,
        {
          backgroundColor: theme.card,
          borderColor: isCurrent ? Colors.primary + "40" : theme.border,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      {episode.imageUrl ? (
        <Image
          source={{ uri: episode.imageUrl }}
          style={styles.episodeImage}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[styles.episodeImagePlaceholder, { backgroundColor: theme.cardElevated }]}>
          <Feather name="headphones" size={24} color={Colors.primary} />
        </View>
      )}

      <View style={styles.episodeInfo}>
        {podcast && (
          <Text
            style={[styles.podcastName, { color: Colors.primary, fontFamily: "Inter_500Medium" }]}
            numberOfLines={1}
          >
            {podcast.title}
          </Text>
        )}
        <Text
          style={[styles.episodeTitle, { color: theme.text, fontFamily: "Inter_500Medium" }]}
          numberOfLines={2}
        >
          {episode.title}
        </Text>
        <View style={styles.episodeMeta}>
          {episode.duration > 0 && (
            <Text style={[styles.metaText, { color: theme.textSecondary, fontFamily: "Inter_400Regular" }]}>
              {formatDuration(episode.duration)}
            </Text>
          )}
          {episode.listenedAt && (
            <View style={[styles.listenedBadge, { backgroundColor: theme.textTertiary + "20" }]}>
              <Feather name="check" size={10} color={theme.textSecondary} />
              <Text style={[styles.listenedText, { color: theme.textSecondary, fontFamily: "Inter_500Medium" }]}>
                Listened
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.actions}>
        <View style={[styles.playIcon, { backgroundColor: isCurrent && isPlaying ? Colors.primary : Colors.primary + "20" }]}>
          <Feather
            name={isCurrent && isPlaying ? "pause" : "play"}
            size={18}
            color={isCurrent && isPlaying ? "#fff" : Colors.primary}
          />
        </View>
        <Pressable onPress={handleDelete} hitSlop={8}>
          <Feather name="trash-2" size={18} color={theme.textTertiary} />
        </Pressable>
      </View>
    </Pressable>
  );
}

export default function DownloadsScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { getDownloadedEpisodes } = usePodcasts();
  const { currentEpisode } = usePlayer();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;
  const downloadedEpisodes = getDownloadedEpisodes();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={[styles.title, { color: theme.text, fontFamily: "Inter_700Bold" }]}>
          Downloads
        </Text>
        {downloadedEpisodes.length > 0 && (
          <View style={[styles.countBadge, { backgroundColor: Colors.primary + "20" }]}>
            <Text style={[styles.countText, { color: Colors.primary, fontFamily: "Inter_600SemiBold" }]}>
              {downloadedEpisodes.length}
            </Text>
          </View>
        )}
      </View>

      <FlatList
        data={downloadedEpisodes}
        keyExtractor={(item) => item.id}
        scrollEnabled={!!downloadedEpisodes.length}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: currentEpisode ? 90 + bottomPad : 24 + bottomPad },
        ]}
        renderItem={({ item }) => <DownloadedEpisodeCard episode={item} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: Colors.primary + "15" }]}>
              <Feather name="download" size={40} color={Colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text, fontFamily: "Inter_600SemiBold" }]}>
              No downloads
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary, fontFamily: "Inter_400Regular" }]}>
              Download episodes to listen offline. Go to a podcast and tap the download icon.
            </Text>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 32,
  },
  countBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countText: {
    fontSize: 14,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 10,
  },
  episodeCard: {
    flexDirection: "row",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    gap: 14,
    alignItems: "center",
  },
  episodeImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
    flexShrink: 0,
  },
  episodeImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  episodeInfo: {
    flex: 1,
    gap: 4,
  },
  podcastName: {
    fontSize: 12,
  },
  episodeTitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  episodeMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  metaText: {
    fontSize: 12,
  },
  listenedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  listenedText: {
    fontSize: 11,
  },
  actions: {
    gap: 14,
    alignItems: "center",
  },
  playIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 80,
    paddingHorizontal: 40,
    gap: 16,
  },
  emptyIcon: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 22,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  miniPlayerContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
});
