"use client";

export interface PersistedBookmark {
  id: string;
  chapterIndex: number;
  progressSeconds: number;
  createdAt: string;
}

export interface PlaybackDefaults {
  speed: number;
  sleepTimerMinutes: number | null;
}

export interface PersistedPlaybackState {
  currentChapterIndex: number;
  progressSeconds: number;
  speed: number;
  isBookmarked: boolean;
  sleepTimerMinutes: number | null;
  playbackArtifactKind?:
    | "sample-generation"
    | "full-book-generation"
    | "imported-audio"
    | null;
  bookmarks?: PersistedBookmark[];
  updatedAt?: string;
}

export const chapterDurationSeconds = 132;
export const playbackChangedEvent = "adaptive-audio-player.playback-changed";
export const playbackDefaultsChangedEvent =
  "adaptive-audio-player.playback-defaults-changed";
const playbackDefaultsStorageKey = "adaptive-audio-player.playback.defaults";

export function getPlaybackStorageKey(bookId: string): string {
  return `adaptive-audio-player.playback.${bookId}`;
}

export function readPlaybackDefaults(): PlaybackDefaults | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(playbackDefaultsStorageKey);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as PlaybackDefaults;
  } catch {
    return null;
  }
}

export function writePlaybackDefaults(defaults: PlaybackDefaults): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(playbackDefaultsStorageKey, JSON.stringify(defaults));
  window.dispatchEvent(new Event(playbackDefaultsChangedEvent));
}

export function clearPlaybackDefaults(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(playbackDefaultsStorageKey);
  window.dispatchEvent(new Event(playbackDefaultsChangedEvent));
}

export function readPersistedPlaybackState(
  bookId: string,
): PersistedPlaybackState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(getPlaybackStorageKey(bookId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PersistedPlaybackState;
    return {
      ...parsed,
      playbackArtifactKind: parsed.playbackArtifactKind ?? null,
      bookmarks: parsed.bookmarks ?? [],
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function resolvePreferredPlaybackState(
  localState: PersistedPlaybackState | null,
  backendState: PersistedPlaybackState | null,
): PersistedPlaybackState | null {
  if (!localState) {
    return backendState;
  }

  if (!backendState) {
    return localState;
  }

  const localUpdatedAt = new Date(localState.updatedAt ?? 0).getTime();
  const backendUpdatedAt = new Date(backendState.updatedAt ?? 0).getTime();

  return backendUpdatedAt > localUpdatedAt ? backendState : localState;
}

export function writePersistedPlaybackState(
  bookId: string,
  payload: PersistedPlaybackState,
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    getPlaybackStorageKey(bookId),
    JSON.stringify({
      ...payload,
      updatedAt: new Date().toISOString(),
    }),
  );
  window.dispatchEvent(new Event(playbackChangedEvent));
}

export function clearPersistedPlaybackState(bookId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(getPlaybackStorageKey(bookId));
  window.dispatchEvent(new Event(playbackChangedEvent));
}

export function formatPlaybackTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function getPlaybackPercent(progressSeconds: number): number {
  return Math.min(Math.round((progressSeconds / chapterDurationSeconds) * 100), 100);
}

export function formatBookmarkLabel(
  chapterTitle: string,
  progressSeconds: number,
): string {
  return `${chapterTitle} · ${formatPlaybackTime(progressSeconds)}`;
}
