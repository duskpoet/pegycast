import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";

import Colors from "@/constants/colors";
import { Podcast, usePodcasts } from "@/context/PodcastContext";

interface PodcastCardProps {
  podcast: Podcast;
  onLongPress?: () => void;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function PodcastCard({ podcast, onLongPress }: PodcastCardProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? Colors.dark : Colors.light;
  const { getEpisodesByPodcast } = usePodcasts();
  const episodes = getEpisodesByPodcast(podcast.id);
  const latestEpisode = episodes.length > 0
    ? episodes.reduce((a, b) => (a.publishedAt > b.publishedAt ? a : b))
    : null;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: "/podcast/[id]", params: { id: podcast.id } });
  };

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress?.();
  };

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <View style={styles.imageContainer}>
        {podcast.imageUrl ? (
          <Image
            source={{ uri: podcast.imageUrl }}
            style={styles.image}
            contentFit="cover"
            transition={300}
          />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: theme.cardElevated }]}>
            <Feather name="mic" size={32} color={Colors.primary} />
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text
          style={[styles.title, { color: theme.text, fontFamily: "Inter_600SemiBold" }]}
          numberOfLines={2}
        >
          {podcast.title}
        </Text>
        {podcast.author ? (
          <Text
            style={[styles.author, { color: theme.textSecondary, fontFamily: "Inter_400Regular" }]}
            numberOfLines={1}
          >
            {podcast.author}
          </Text>
        ) : null}
        {latestEpisode && (
          <View style={styles.latestRow}>
            <Text style={[styles.latestDate, { color: theme.textTertiary, fontFamily: "Inter_400Regular" }]}>
              {formatDate(latestEpisode.publishedAt)}
            </Text>
            {latestEpisode.listenedAt && (
              <View style={[styles.listenedBadge, { backgroundColor: theme.textTertiary + "20" }]}>
                <Feather name="check" size={10} color={theme.textSecondary} />
                <Text style={[styles.listenedText, { color: theme.textSecondary, fontFamily: "Inter_500Medium" }]}>
                  Listened
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
      <Feather name="chevron-right" size={18} color={theme.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    gap: 14,
  },
  imageContainer: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: "hidden",
    flexShrink: 0,
  },
  image: {
    width: 64,
    height: 64,
  },
  imagePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
  },
  author: {
    fontSize: 13,
    lineHeight: 17,
  },
  latestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  latestDate: {
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
});
