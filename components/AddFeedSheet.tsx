import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { usePodcasts } from "@/context/PodcastContext";

const EXAMPLE_FEEDS = [
  { name: "NPR News Now", url: "https://feeds.npr.org/500005/podcast.xml" },
  { name: "Serial", url: "https://feeds.simplecast.com/xl1ZanEk" },
  { name: "TED Talks Daily", url: "https://feeds.feedburner.com/tedtalks_audio" },
];

interface AddFeedSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function AddFeedSheet({ visible, onClose }: AddFeedSheetProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { addPodcast, podcasts } = usePodcasts();
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleAdd = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    const alreadyAdded = podcasts.some((p) => p.feedUrl === trimmed);
    if (alreadyAdded) {
      Alert.alert("Already Subscribed", "You are already subscribed to this feed.");
      return;
    }

    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await addPodcast(trimmed);
      setUrl("");
      onClose();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
    console.error(e)
      Alert.alert("Error", "Could not load this feed. Please check the URL and try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExample = async (feedUrl: string) => {
    setUrl(feedUrl);
    inputRef.current?.focus();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.sheetWrapper}
      >
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.surface,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={[styles.heading, { color: theme.text, fontFamily: "Inter_700Bold" }]}>
              Add Podcast
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Feather name="x" size={22} color={theme.textSecondary} />
            </Pressable>
          </View>

          <Text style={[styles.label, { color: theme.textSecondary, fontFamily: "Inter_500Medium" }]}>
            RSS Feed URL
          </Text>

          <View
            style={[
              styles.inputContainer,
              { backgroundColor: theme.cardElevated, borderColor: theme.border },
            ]}
          >
            <Feather name="rss" size={18} color={Colors.primary} style={styles.inputIcon} />
            <TextInput
              ref={inputRef}
              value={url}
              onChangeText={setUrl}
              placeholder="https://feeds.example.com/podcast.xml"
              placeholderTextColor={theme.textTertiary}
              style={[styles.input, { color: theme.text, fontFamily: "Inter_400Regular" }]}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              onSubmitEditing={handleAdd}
            />
            {url.length > 0 && (
              <Pressable onPress={() => setUrl("")} hitSlop={8}>
                <Feather name="x-circle" size={18} color={theme.textTertiary} />
              </Pressable>
            )}
          </View>

          <Pressable
            onPress={handleAdd}
            disabled={isLoading || !url.trim()}
            style={({ pressed }) => [
              styles.addButton,
              {
                backgroundColor: url.trim() && !isLoading ? Colors.primary : theme.cardElevated,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text
                style={[
                  styles.addButtonText,
                  {
                    color: url.trim() ? "#fff" : theme.textTertiary,
                    fontFamily: "Inter_600SemiBold",
                  },
                ]}
              >
                Subscribe
              </Text>
            )}
          </Pressable>

          <Text style={[styles.sectionLabel, { color: theme.textTertiary, fontFamily: "Inter_500Medium" }]}>
            Try an example
          </Text>

          {EXAMPLE_FEEDS.map((feed) => (
            <Pressable
              key={feed.url}
              onPress={() => handleExample(feed.url)}
              style={({ pressed }) => [
                styles.exampleRow,
                { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={[styles.exampleIcon, { backgroundColor: Colors.primary + "20" }]}>
                <Feather name="mic" size={14} color={Colors.primary} />
              </View>
              <Text style={[styles.exampleName, { color: theme.text, fontFamily: "Inter_400Regular" }]}>
                {feed.name}
              </Text>
              <Feather name="arrow-up-left" size={16} color={theme.textTertiary} />
            </Pressable>
          ))}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheetWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ccc",
    alignSelf: "center",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  heading: {
    fontSize: 22,
  },
  label: {
    fontSize: 13,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    marginBottom: 16,
  },
  inputIcon: {
    flexShrink: 0,
  },
  input: {
    flex: 1,
    fontSize: 15,
  },
  addButton: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  addButtonText: {
    fontSize: 16,
  },
  sectionLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  exampleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  exampleIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  exampleName: {
    flex: 1,
    fontSize: 14,
  },
});
