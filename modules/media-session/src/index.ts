import { requireNativeModule, EventEmitter } from "expo-modules-core";

interface MediaSessionNativeModule {
  updateNowPlaying(info: {
    title: string;
    artist: string;
    artwork: string;
    duration: number;
    position: number;
    isPlaying: boolean;
  }): void;
  updatePlaybackState(isPlaying: boolean, position: number): void;
  clearNowPlaying(): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

let nativeModule: MediaSessionNativeModule | null = null;

try {
  nativeModule = requireNativeModule("MediaSession");
} catch {
  console.warn("MediaSession native module not available");
}

const emitter = nativeModule
  ? new EventEmitter(nativeModule as any)
  : null;

export function updateNowPlaying(info: {
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  position: number;
  isPlaying: boolean;
}) {
  nativeModule?.updateNowPlaying(info);
}

export function updatePlaybackState(isPlaying: boolean, position: number) {
  nativeModule?.updatePlaybackState(isPlaying, position);
}

export function clearNowPlaying() {
  nativeModule?.clearNowPlaying();
}

export function addListener(
  _eventName: "onMediaCommand",
  listener: (event: { command: string; seekTime?: number }) => void
) {
  return emitter?.addListener("onMediaCommand", listener) ?? null;
}