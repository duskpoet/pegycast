import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio, AVPlaybackStatus } from "expo-av";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Episode } from "./PodcastContext";

const STORAGE_KEY = "player_state";

interface PlayerContextValue {
  currentEpisode: Episode | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  playEpisode: (episode: Episode) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seek: (position: number) => Promise<void>;
  skipForward: () => Promise<void>;
  skipBackward: () => Promise<void>;
  stop: () => Promise<void>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const positionRef = useRef(0);
  const episodeRef = useRef<Episode | null>(null);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    episodeRef.current = currentEpisode;
  }, [currentEpisode]);

  // Save playback state periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const ep = episodeRef.current;
      const pos = positionRef.current;
      if (ep) {
        AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ episode: ep, position: pos })
        ).catch(console.error);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    }).catch(console.error);

    // Restore saved playback state
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const { episode, position: savedPos } = JSON.parse(raw) as {
          episode: Episode;
          position: number;
        };
        if (episode) {
          setCurrentEpisode(episode);
          setPosition(savedPos);
          // Load the sound paused at the saved position
          const uri = episode.downloadedPath || episode.audioUrl;
          Audio.Sound.createAsync(
            { uri },
            { shouldPlay: false, positionMillis: savedPos * 1000 },
            (status: AVPlaybackStatus) => {
              if (!status.isLoaded) return;
              setIsPlaying(status.isPlaying);
              setPosition(status.positionMillis / 1000);
              setDuration((status.durationMillis ?? 0) / 1000);
            }
          ).then(({ sound }) => {
            soundRef.current = sound;
          });
        }
      })
      .catch(console.error);

    return () => {
      // Save final state on unmount
      const ep = episodeRef.current;
      const pos = positionRef.current;
      if (ep) {
        AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ episode: ep, position: pos })
        ).catch(console.error);
      }
      soundRef.current?.unloadAsync().catch(console.error);
    };
  }, []);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setIsPlaying(status.isPlaying);
    setPosition(status.positionMillis / 1000);
    setDuration((status.durationMillis ?? 0) / 1000);
  }, []);

  const playEpisode = useCallback(
    async (episode: Episode) => {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      setCurrentEpisode(episode);
      setPosition(0);
      setDuration(0);

      const uri = episode.downloadedPath || episode.audioUrl;
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );
      soundRef.current = sound;
      AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ episode, position: 0 })
      ).catch(console.error);
    },
    [onPlaybackStatusUpdate]
  );

  const togglePlayPause = useCallback(async () => {
    if (!soundRef.current) return;
    const status = await soundRef.current.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) {
      await soundRef.current.pauseAsync();
    } else {
      await soundRef.current.playAsync();
    }
  }, []);

  const seek = useCallback(async (positionSecs: number) => {
    if (!soundRef.current) return;
    await soundRef.current.setPositionAsync(positionSecs * 1000);
    setPosition(positionSecs);
  }, []);

  const skipForward = useCallback(async () => {
    if (!soundRef.current) return;
    const status = await soundRef.current.getStatusAsync();
    if (!status.isLoaded) return;
    const newPos = Math.min((status.positionMillis + 30000) / 1000, duration);
    await soundRef.current.setPositionAsync(newPos * 1000);
    setPosition(newPos);
  }, [duration]);

  const skipBackward = useCallback(async () => {
    if (!soundRef.current) return;
    const status = await soundRef.current.getStatusAsync();
    if (!status.isLoaded) return;
    const newPos = Math.max((status.positionMillis - 15000) / 1000, 0);
    await soundRef.current.setPositionAsync(newPos * 1000);
    setPosition(newPos);
  }, []);

  const stop = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setCurrentEpisode(null);
    setIsPlaying(false);
    setPosition(0);
    setDuration(0);
    AsyncStorage.removeItem(STORAGE_KEY).catch(console.error);
  }, []);

  const value = useMemo(
    () => ({
      currentEpisode,
      isPlaying,
      position,
      duration,
      playEpisode,
      togglePlayPause,
      seek,
      skipForward,
      skipBackward,
      stop,
    }),
    [
      currentEpisode,
      isPlaying,
      position,
      duration,
      playEpisode,
      togglePlayPause,
      seek,
      skipForward,
      skipBackward,
      stop,
    ]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
