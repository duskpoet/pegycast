import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";

import Colors from "@/constants/colors";
import { Podcast } from "@/context/PodcastContext";

interface PodcastCardProps {
  podcast: Podcast;
  onLongPress?: () => void;
}

export function PodcastCard({ podcast, onLongPress }: PodcastCardProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? Colors.dark : Colors.light;

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
});
