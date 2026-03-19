import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import {
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

import { AddFeedSheet } from "@/components/AddFeedSheet";
import { MiniPlayer } from "@/components/MiniPlayer";
import { PodcastCard } from "@/components/PodcastCard";
import Colors from "@/constants/colors";
import { Podcast, usePodcasts } from "@/context/PodcastContext";
import { usePlayer } from "@/context/PlayerContext";

export default function PodcastsScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { podcasts, removePodcast, isLoading } = usePodcasts();
  const { currentEpisode } = usePlayer();
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const handleRemove = (podcast: Podcast) => {
    Alert.alert(
      "Remove Podcast",
      `Remove "${podcast.title}" from your library?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            removePodcast(podcast.id);
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={[styles.title, { color: theme.text, fontFamily: "Inter_700Bold" }]}>
          My Podcasts
        </Text>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowAddSheet(true);
          }}
          style={({ pressed }) => [
            styles.addBtn,
            { backgroundColor: Colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Feather name="plus" size={22} color="#fff" />
        </Pressable>
      </View>

      <FlatList
        data={podcasts}
        keyExtractor={(item) => item.id}
        scrollEnabled={!!podcasts.length}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: currentEpisode ? 90 + bottomPad : 24 + bottomPad },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={Colors.primary}
            onRefresh={() => {
              setRefreshing(false);
            }}
          />
        }
        renderItem={({ item }) => (
          <PodcastCard podcast={item} onLongPress={() => handleRemove(item)} />
        )}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: Colors.primary + "15" }]}>
                <Feather name="mic" size={40} color={Colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text, fontFamily: "Inter_600SemiBold" }]}>
                No podcasts yet
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.textSecondary, fontFamily: "Inter_400Regular" }]}>
                Add a podcast by tapping the{" "}
                <Text style={{ color: Colors.primary }}>+</Text> button above
              </Text>
              <Pressable
                onPress={() => setShowAddSheet(true)}
                style={({ pressed }) => [
                  styles.emptyBtn,
                  { backgroundColor: Colors.primary, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={[styles.emptyBtnText, { fontFamily: "Inter_600SemiBold" }]}>
                  Add Podcast
                </Text>
              </Pressable>
            </View>
          )
        }
      />

      {currentEpisode && (
        <View style={[styles.miniPlayerContainer, { paddingBottom: bottomPad || insets.bottom + 60 }]}>
          <MiniPlayer />
        </View>
      )}

      <AddFeedSheet visible={showAddSheet} onClose={() => setShowAddSheet(false)} />
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
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 32,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    paddingTop: 8,
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
  emptyBtn: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  emptyBtnText: {
    color: "#fff",
    fontSize: 16,
  },
  miniPlayerContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
});
