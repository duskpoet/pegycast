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

import * as MediaSession from "../modules/media-session/src";
import { Episode, usePodcasts } from "./PodcastContext";

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
  const { updateEpisode } = usePodcasts();
  const soundRef = useRef<Audio.Sound | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const positionRef = useRef(0);
  const episodeRef = useRef<Episode | null>(null);
  const isPlayingRef = useRef(false);
  const durationRef = useRef(0);
  const markedListenedRef = useRef<string | null>(null);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    episodeRef.current = currentEpisode;
  }, [currentEpisode]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  // Update media session playback state when playing/position changes
  useEffect(() => {
    if (currentEpisode) {
      MediaSession.updatePlaybackState(isPlaying, position);
    }
  }, [isPlaying, currentEpisode, Math.floor(position / 5)]); // Update every ~5 seconds

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

  // Listen for media session commands (headphones, notification, lock screen)
  useEffect(() => {
    const subscription = MediaSession.addListener(
      "onMediaCommand",
      (event: { command: string; seekTime?: number }) => {
        switch (event.command) {
          case "play":
            soundRef.current?.playAsync();
            break;
          case "pause":
            soundRef.current?.pauseAsync();
            break;
          case "togglePlayPause":
            if (isPlayingRef.current) {
              soundRef.current?.pauseAsync();
            } else {
              soundRef.current?.playAsync();
            }
            break;
          case "stop":
            stopPlayback();
            break;
          case "skipForward":
            handleSkipForward();
            break;
          case "skipBackward":
            handleSkipBackward();
            break;
          case "seek":
            if (event.seekTime != null) {
              soundRef.current?.setPositionAsync(event.seekTime * 1000);
              setPosition(event.seekTime);
            }
            break;
        }
      }
    );
    return () => subscription?.remove();
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
          const uri = episode.downloadedPath || episode.audioUrl;
          Audio.Sound.createAsync(
            { uri },
            { shouldPlay: false, positionMillis: savedPos * 1000 },
            onPlaybackStatusUpdate
          ).then(({ sound }) => {
            soundRef.current = sound;
            // Set now playing info for restored episode
            MediaSession.updateNowPlaying({
              title: episode.title,
              artist: "Podcast",
              artwork: episode.imageUrl,
              duration: episode.duration || 0,
              position: savedPos,
              isPlaying: false,
            });
          }).catch(console.error);
        }
      })
      .catch(console.error);

    return () => {
      const ep = episodeRef.current;
      const pos = positionRef.current;
      if (ep) {
        AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ episode: ep, position: pos })
        ).catch(console.error);
      }
      soundRef.current?.unloadAsync().catch(console.error);
      MediaSession.clearNowPlaying();
    };
  }, []);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setIsPlaying(status.isPlaying);
    setPosition(status.positionMillis / 1000);
    setDuration((status.durationMillis ?? 0) / 1000);
    const ep = episodeRef.current;
    if (ep && markedListenedRef.current !== ep.id) {
      const dur = status.durationMillis ?? 0;
      if (status.didJustFinish || (dur > 0 && status.positionMillis / dur >= 0.9)) {
        markedListenedRef.current = ep.id;
        updateEpisode(ep.id, { listenedAt: Date.now() });
      }
    }
  }, [updateEpisode]);

  const playEpisode = useCallback(
    async (episode: Episode) => {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      setCurrentEpisode(episode);
      setPosition(0);
      setDuration(0);
      markedListenedRef.current = null;

      const uri = episode.downloadedPath || episode.audioUrl;
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );
      soundRef.current = sound;

      // Update media session now playing info
      MediaSession.updateNowPlaying({
        title: episode.title,
        artist: "Podcast",
        artwork: episode.imageUrl,
        duration: episode.duration || 0,
        position: 0,
        isPlaying: true,
      });

      AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ episode, position: 0 })
      ).catch(console.error);
    },
    [onPlaybackStatusUpdate]
  );

  const togglePlayPause = useCallback(async () => {
    if (!soundRef.current) return;
    try {
      const status = await soundRef.current.getStatusAsync();
      if (!status.isLoaded) return;
      if (status.isPlaying) {
        await soundRef.current.pauseAsync();
      } else {
        await soundRef.current.playAsync();
      }
    } catch (e) {
      console.error("togglePlayPause failed", e);
    }
  }, []);

  const seek = useCallback(async (positionSecs: number) => {
    if (!soundRef.current) return;
    try {
      await soundRef.current.setPositionAsync(positionSecs * 1000);
      setPosition(positionSecs);
    } catch (e) {
      console.error("seek failed", e);
    }
  }, []);

  const handleSkipForward = useCallback(async () => {
    if (!soundRef.current) return;
    try {
      const status = await soundRef.current.getStatusAsync();
      if (!status.isLoaded) return;
      const newPos = Math.min(
        (status.positionMillis + 30000) / 1000,
        durationRef.current
      );
      await soundRef.current.setPositionAsync(newPos * 1000);
      setPosition(newPos);
    } catch (e) {
      console.error("skipForward failed", e);
    }
  }, []);

  const handleSkipBackward = useCallback(async () => {
    if (!soundRef.current) return;
    try {
      const status = await soundRef.current.getStatusAsync();
      if (!status.isLoaded) return;
      const newPos = Math.max((status.positionMillis - 15000) / 1000, 0);
      await soundRef.current.setPositionAsync(newPos * 1000);
      setPosition(newPos);
    } catch (e) {
      console.error("skipBackward failed", e);
    }
  }, []);

  const stopPlayback = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch (e) {
        console.error("stopPlayback unload failed", e);
      }
      soundRef.current = null;
    }
    setCurrentEpisode(null);
    setIsPlaying(false);
    setPosition(0);
    setDuration(0);
    MediaSession.clearNowPlaying();
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
      skipForward: handleSkipForward,
      skipBackward: handleSkipBackward,
      stop: stopPlayback,
    }),
    [
      currentEpisode,
      isPlaying,
      position,
      duration,
      playEpisode,
      togglePlayPause,
      seek,
      handleSkipForward,
      handleSkipBackward,
      stopPlayback,
    ]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}