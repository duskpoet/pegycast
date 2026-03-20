import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutChangeEvent, Platform, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Collapsible } from "@/components/Collapsible";
import Colors from "@/constants/colors";
import { usePlayer } from "@/context/PlayerContext";
import { usePodcasts } from "@/context/PodcastContext";

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ProgressBar({
  position,
  duration,
  onSeek,
}: {
  position: number;
  duration: number;
  onSeek: (pos: number) => void;
}) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? Colors.dark : Colors.light;
  const trackWidth = useRef(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);

  const displayPosition = isSeeking ? seekPosition : position;
  const progress = duration > 0 ? Math.min(displayPosition / duration, 1) : 0;

  const thumbScale = useSharedValue(1);
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: thumbScale.value }],
  }));

  const handleLayout = (e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
  };

  const clampSeek = (x: number) => {
    if (duration <= 0 || trackWidth.current <= 0) return 0;
    const ratio = Math.max(0, Math.min(x / trackWidth.current, 1));
    return ratio * duration;
  };

  const beginSeek = () => {
    setIsSeeking(true);
  };

  const updateSeek = (pos: number) => {
    setSeekPosition(pos);
  };

  const commitSeek = (pos: number) => {
    onSeek(pos);
    setIsSeeking(false);
  };

  const panGesture = Gesture.Pan()
    .hitSlop({ top: 16, bottom: 16 })
    .runOnJS(true)
    .onBegin((e) => {
      thumbScale.value = withSpring(1.6);
      beginSeek();
      updateSeek(clampSeek(e.x));
    })
    .onUpdate((e) => {
      updateSeek(clampSeek(e.x));
    })
    .onEnd((e) => {
      thumbScale.value = withSpring(1);
      commitSeek(clampSeek(e.x));
    })
    .onFinalize(() => {
      thumbScale.value = withSpring(1);
      setIsSeeking(false);
    });

  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSeek(clampSeek(e.x));
    });

  const gesture = Gesture.Exclusive(panGesture, tapGesture);

  return (
    <View style={progressStyles.container}>
      <GestureDetector gesture={gesture}>
        <View style={progressStyles.touchArea} onLayout={handleLayout}>
          <View style={[progressStyles.track, { backgroundColor: theme.cardElevated }]}>
            <View style={[progressStyles.fill, { flex: progress, backgroundColor: Colors.primary }]} />
            <View style={[progressStyles.empty, { flex: 1 - progress }]} />
          </View>
          <Animated.View
            style={[
              progressStyles.thumb,
              { backgroundColor: Colors.primary, left: `${progress * 100}%` },
              thumbStyle,
            ]}
          />
        </View>
      </GestureDetector>
      <View style={progressStyles.times}>
        <Text style={[progressStyles.timeText, { color: theme.textSecondary, fontFamily: "Inter_400Regular" }]}>
          {formatTime(displayPosition)}
        </Text>
        <Text style={[progressStyles.timeText, { color: theme.textSecondary, fontFamily: "Inter_400Regular" }]}>
          -{formatTime(Math.max(0, duration - displayPosition))}
        </Text>
      </View>
    </View>
  );
}

const progressStyles = StyleSheet.create({
  container: {
    width: "100%",
    gap: 10,
  },
  touchArea: {
    width: "100%",
    paddingVertical: 12,
    justifyContent: "center",
  },
  track: {
    height: 4,
    borderRadius: 2,
    width: "100%",
    flexDirection: "row",
    overflow: "hidden",
  },
  fill: {
    height: 4,
    borderRadius: 2,
  },
  empty: {
    height: 4,
  },
  thumb: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
    top: 12 - 5, // center on track (paddingVertical - half of thumb beyond track)
  },
  times: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  timeText: {
    fontSize: 13,
  },
});

export default function PlayerScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { currentEpisode, isPlaying, position, duration, togglePlayPause, seek, skipForward, skipBackward, stop } =
    usePlayer();
  const { podcasts } = usePodcasts();
  const [showDetails, setShowDetails] = useState(false);

  const toggleDetails = useCallback(() => {
    setShowDetails((prev) => !prev);
  }, []);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  // Navigate back if no episode is playing — must be in useEffect, never during render
  useEffect(() => {
    if (!currentEpisode) {
      router.back();
    }
  }, [currentEpisode]);

  if (!currentEpisode) return null;

  const podcast = podcasts.find((p) => p.id === currentEpisode.podcastId);

  const handlePlayPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    togglePlayPause();
  };

  const handleSkipFwd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    skipForward();
  };

  const handleSkipBwd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    skipBackward();
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
          paddingTop: topPad + 12,
          paddingBottom: bottomPad + 24,
        },
      ]}
    >
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.downBtn, { opacity: pressed ? 0.6 : 1 }]}
          hitSlop={8}
        >
          <Feather name="chevron-down" size={28} color={theme.text} />
        </Pressable>
        <Text style={[styles.nowPlaying, { color: theme.textSecondary, fontFamily: "Inter_500Medium" }]}>
          Now Playing
        </Text>
        <Pressable
          onPress={() => {
            stop();
            router.back();
          }}
          style={({ pressed }) => [styles.stopBtn, { opacity: pressed ? 0.6 : 1 }]}
          hitSlop={8}
        >
          <Feather name="x" size={22} color={theme.textTertiary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.artworkRow}>
          <Pressable
            onPress={handleSkipBwd}
            style={({ pressed }) => [
              styles.sideZone,
              { borderColor: theme.border },
              pressed && { backgroundColor: theme.card },
            ]}
          >
            <Feather name="rotate-ccw" size={18} color={theme.textTertiary} />
            <Text style={[styles.sideZoneLabel, { color: theme.textTertiary }]}>15</Text>
          </Pressable>
          <View style={[styles.artworkWrapper, isPlaying && styles.artworkGlowOuter]}>
            <View style={[styles.artworkWrapper, isPlaying && styles.artworkGlowInner]}>
              <Pressable
                onPress={handlePlayPause}
                style={({ pressed }) => [styles.artworkContainer, pressed && { opacity: 0.7 }]}
              >
                {currentEpisode.imageUrl ? (
                  <Image
                    source={{ uri: currentEpisode.imageUrl }}
                    style={styles.artwork}
                    contentFit="cover"
                    transition={300}
                  />
                ) : (
                  <View style={[styles.artworkPlaceholder, { backgroundColor: theme.card }]}>
                    <Feather name="headphones" size={80} color={Colors.primary} />
                  </View>
                )}
              </Pressable>
            </View>
          </View>
          <Pressable
            onPress={handleSkipFwd}
            style={({ pressed }) => [
              styles.sideZone,
              { borderColor: theme.border },
              pressed && { backgroundColor: theme.card },
            ]}
          >
            <Feather name="rotate-cw" size={18} color={theme.textTertiary} />
            <Text style={[styles.sideZoneLabel, { color: theme.textTertiary }]}>30</Text>
          </Pressable>
        </View>

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
            style={[styles.episodeTitle, { color: theme.text, fontFamily: "Inter_700Bold" }]}
            numberOfLines={showDetails ? undefined : 2}
          >
            {currentEpisode.title}
          </Text>
        </View>

        {currentEpisode.description ? (
          <View style={styles.detailsSection}>
            <Collapsible expanded={showDetails} collapsedHeight={110}>
              <Text style={[styles.detailsDescription, { color: theme.textSecondary, fontFamily: "Inter_400Regular" }]}>
                {currentEpisode.description}
              </Text>
            </Collapsible>
            <Collapsible expanded={showDetails}>
              <View style={styles.detailsMeta}>
                {currentEpisode.publishedAt > 0 && (
                  <View style={styles.detailsRow}>
                    <Feather name="calendar" size={13} color={theme.textTertiary} />
                    <Text style={[styles.detailsMetaText, { color: theme.textTertiary, fontFamily: "Inter_400Regular" }]}>
                      {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium"}).format(new Date(currentEpisode.publishedAt))}
                    </Text>
                  </View>
                )}
                {currentEpisode.fileSize > 0 && (
                  <View style={styles.detailsRow}>
                    <Feather name="hard-drive" size={13} color={theme.textTertiary} />
                    <Text style={[styles.detailsMetaText, { color: theme.textTertiary, fontFamily: "Inter_400Regular" }]}>
                      {currentEpisode.fileSize >= 1048576
                        ? `${(currentEpisode.fileSize / 1048576).toFixed(1)} MB`
                        : `${Math.round(currentEpisode.fileSize / 1024)} KB`}
                    </Text>
                  </View>
                )}
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

        <ProgressBar position={position} duration={duration} onSeek={seek} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingHorizontal: 28,
    alignItems: "center",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 24,
    paddingHorizontal: 28,
  },
  downBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  nowPlaying: {
    fontSize: 14,
    letterSpacing: 0.5,
  },
  stopBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  artworkWrapper: {
    borderRadius: 20,
    backgroundColor: Colors.primary,
  },
  artworkGlowOuter: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 24,
    elevation: 24,
  },
  artworkGlowInner: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 12,
  },
  artworkContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  artwork: {
    width: 260,
    height: 260,
    borderRadius: 20,
  },
  artworkPlaceholder: {
    width: 260,
    height: 260,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  episodeInfo: {
    width: "100%",
    gap: 6,
    marginBottom: 28,
  },
  podcastName: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  episodeTitle: {
    fontSize: 22,
    lineHeight: 30,
  },
  artworkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginBottom: 32,
    marginTop: 16,
  },
  sideZone: {
    width: 48,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 16,
    marginHorizontal: 4,
  },
  sideZoneLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: -1,
  },
  detailsSection: {
    width: "100%",
    marginBottom: 20,
  },
  detailsDescription: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 10,
  },
  detailsMeta: {
    gap: 6,
    marginBottom: 4,
  },
  detailsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailsMetaText: {
    fontSize: 12,
  },
  showMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  showMoreText: {
    fontSize: 13,
  },
});
