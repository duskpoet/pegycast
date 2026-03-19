import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MiniPlayer } from "@/components/MiniPlayer";
import Colors from "@/constants/colors";
import { usePlayer } from "@/context/PlayerContext";
import { usePodcasts } from "@/context/PodcastContext";

const TADDY_API_KEY = process.env.EXPO_PUBLIC_TADDY_API_KEY ?? "";
const TADDY_USER_ID = process.env.EXPO_PUBLIC_TADDY_USER_ID ?? "";

interface SearchResult {
  uuid: string;
  name: string;
  rssUrl: string;
  imageUrl: string;
  authorName: string;
  totalEpisodesCount: number;
}

const SEARCH_QUERY = `
  query searchPodcasts($term: String!) {
    search(term: $term, filterForTypes: PODCASTSERIES) {
      searchId
      podcastSeries {
        uuid
        name
        rssUrl
        imageUrl
        authorName
        totalEpisodesCount
      }
    }
  }
`;

export default function SearchScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { podcasts, addPodcast } = usePodcasts();
  const { currentEpisode } = usePlayer();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [subscribingId, setSubscribingId] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const subscribedFeeds = new Set(podcasts.map((p) => p.feedUrl));

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsSearching(true);
    setHasSearched(true);
    try {
      const res = await fetch("https://api.taddy.org", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-USER-ID": TADDY_USER_ID,
          "X-API-KEY": TADDY_API_KEY,
        },
        body: JSON.stringify({
          query: SEARCH_QUERY,
          variables: { term: trimmed },
        }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      if (data.errors) throw new Error(data.errors[0]?.message ?? "Search failed");
      setResults(data.data?.search?.podcastSeries ?? []);
    } catch (e: any) {
      Alert.alert("Search Failed", e.message || "Could not search podcasts.");
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [query]);

  const handleSubscribe = useCallback(
    async (item: SearchResult) => {
      if (!item.rssUrl) {
        Alert.alert("No RSS Feed", "This podcast does not have an RSS feed available.");
        return;
      }
      if (subscribedFeeds.has(item.rssUrl)) {
        Alert.alert("Already Subscribed", "You are already subscribed to this podcast.");
        return;
      }
      setSubscribingId(item.uuid);
      try {
        await addPodcast(item.rssUrl);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e: any) {
        console.error("Could not subscribe to podcast", item, e);
        Alert.alert("Error", "Could not subscribe to this podcast.");
      } finally {
        setSubscribingId(null);
      }
    },
    [addPodcast, subscribedFeeds],
  );

  const renderItem = useCallback(
    ({ item }: { item: SearchResult }) => {
      const isSubscribed = subscribedFeeds.has(item.rssUrl);
      const isLoading = subscribingId === item.uuid;

      return (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.artwork}
          />
          <View style={styles.cardContent}>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
              {item.name}
            </Text>
            {item.authorName ? (
              <Text style={[styles.publisher, { color: theme.textSecondary }]} numberOfLines={1}>
                {item.authorName}
              </Text>
            ) : null}
            <Text style={[styles.episodes, { color: theme.textTertiary }]}>
              {item.totalEpisodesCount} episodes
            </Text>
          </View>
          <Pressable
            style={[
              styles.subscribeBtn,
              isSubscribed
                ? { backgroundColor: theme.cardElevated }
                : { backgroundColor: Colors.primary },
            ]}
            onPress={() => handleSubscribe(item)}
            disabled={isSubscribed || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : isSubscribed ? (
              <Feather name="check" size={18} color={Colors.primary} />
            ) : (
              <Feather name="plus" size={18} color="#fff" />
            )}
          </Pressable>
        </View>
      );
    },
    [theme, subscribingId, subscribedFeeds, handleSubscribe],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Search</Text>
      </View>

      <View style={[styles.searchBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Feather name="search" size={18} color={theme.textTertiary} />
        <TextInput
          ref={inputRef}
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search podcasts..."
          placeholderTextColor={theme.textTertiary}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable onPress={() => { setQuery(""); setResults([]); setHasSearched(false); }}>
            <Feather name="x" size={18} color={theme.textTertiary} />
          </Pressable>
        )}
      </View>

      {isSearching ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : !hasSearched ? (
        <View style={styles.centered}>
          <Feather name="search" size={48} color={theme.textTertiary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Find your next favorite podcast
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centered}>
          <Feather name="frown" size={48} color={theme.textTertiary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            No podcasts found
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.uuid}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: (currentEpisode ? 80 : 24) + 60 + bottomPad },
          ]}
          keyboardDismissMode="on-drag"
        />
      )}

      <MiniPlayer bottomOffset={60 + bottomPad} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    height: "100%",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  artwork: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: "#1a1a2e",
  },
  cardContent: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  publisher: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  episodes: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  subscribeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
});