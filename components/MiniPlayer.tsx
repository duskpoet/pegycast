import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import Colors from "@/constants/colors";
import { usePlayer } from "@/context/PlayerContext";

export function MiniPlayer() {
  const { currentEpisode, isPlaying, togglePlayPause, stop } = usePlayer();
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? Colors.dark : Colors.light;
  const scale = useSharedValue(1);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (!currentEpisode) return null;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/player");
  };

  const handlePlayPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSpring(0.95, { duration: 100 }, () => {
      scale.value = withSpring(1);
    });
    togglePlayPause();
  };

  const handleStop = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    stop();
  };

  return (
    <Animated.View style={containerStyle}>
      <Pressable
        onPress={handlePress}
        style={[
          styles.container,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <View style={styles.artwork}>
          {currentEpisode.imageUrl ? (
            <Image
              source={{ uri: currentEpisode.imageUrl }}
              style={styles.image}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.imagePlaceholder, { backgroundColor: theme.cardElevated }]}>
              <Feather name="headphones" size={20} color={Colors.primary} />
            </View>
          )}
        </View>

        <View style={styles.info}>
          <Text
            style={[styles.title, { color: theme.text, fontFamily: "Inter_500Medium" }]}
            numberOfLines={1}
          >
            {currentEpisode.title}
          </Text>
          <Text
            style={[styles.subtitle, { color: theme.textSecondary, fontFamily: "Inter_400Regular" }]}
            numberOfLines={1}
          >
            {isPlaying ? "Playing" : "Paused"}
          </Text>
        </View>

        <Pressable onPress={handlePlayPause} style={styles.playBtn} hitSlop={8}>
          <Feather
            name={isPlaying ? "pause" : "play"}
            size={22}
            color={Colors.primary}
          />
        </Pressable>

        <Pressable onPress={handleStop} style={styles.stopBtn} hitSlop={8}>
          <Feather name="x" size={20} color={theme.textSecondary} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    gap: 12,
  },
  artwork: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: "hidden",
    flexShrink: 0,
  },
  image: {
    width: 44,
    height: 44,
  },
  imagePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
  },
  subtitle: {
    fontSize: 12,
  },
  playBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  stopBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
