# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cross-platform podcast app built with React Native, Expo SDK 54, and TypeScript. Supports iOS, Android, and Web. Features podcast feed subscription via RSS, streaming/downloaded playback with background audio, and native media session controls (lock screen, notifications, headphones).

## Common Commands

- `npm start` — Start Expo dev server
- `npm run ios` — Run on iOS (expo run:ios)
- `npm run android` — Run on Android (expo run:android)
- `npm run web` — Run web version
- `npm run lint` — ESLint via expo lint

No test framework is configured.

## Architecture

**Routing:** File-based routing via Expo Router. Screens live in `app/`, with tab navigation in `app/(tabs)/` and a dynamic podcast detail route at `app/podcast/[id].tsx`. The player is a modal screen (`app/player.tsx`).

**State Management:** Two React Context providers wrap the app (set up in `app/_layout.tsx`):
- `PodcastContext` (`context/PodcastContext.tsx`) — manages podcast subscriptions, RSS feed parsing, episode lists, and file downloads (via expo-file-system). Persists to AsyncStorage.
- `PlayerContext` (`context/PlayerContext.tsx`) — manages audio playback (expo-av), play/pause/seek/skip, background audio mode, and integrates with the native media session module. Persists playback state to AsyncStorage.

**Native Module:** `modules/media-session/` is a custom Expo module (Swift for iOS, Kotlin for Android) that provides lock screen / notification playback controls. The TypeScript API is in `modules/media-session/src/index.ts`.

**Data Flow:** User subscribes to RSS feed → PodcastContext parses XML and stores episodes → user plays episode → PlayerContext streams audio (or plays local file if downloaded) → media session module updates OS-level now-playing info.

## Key Conventions

- Path alias: `@/*` maps to project root (configured in tsconfig.json)
- Typed routes enabled (`experiments.typedRoutes` in app.json)
- React Compiler enabled
- Theme colors defined in `constants/colors.ts` (light/dark mode)
- Icons: Feather icons via `@expo/vector-icons`
- Fonts: Inter font family via `@expo-google-fonts/inter`
