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
    | null;
  bookmarks?: PersistedBookmark[];
  updatedAt?: string;
}

export interface BookProgressSnapshot {
  positionSeconds: number;
  durationSeconds: number;
  speed: number;
  chapterIndex: number | null;
}

export interface BookProgress extends BookProgressSnapshot {
  bookId: string;
  artifactId: string;
  revision: number;
  updatedAt: string;
}

export interface PutBookProgressRequest {
  bookId: string;
  artifactId: string;
  revision: number;
  snapshot: BookProgressSnapshot;
  keepalive?: boolean;
}

export interface BookProgressWriter {
  record: (snapshot: BookProgressSnapshot) => Promise<boolean>;
  flush: (
    snapshot: BookProgressSnapshot,
    options?: { keepalive?: boolean },
  ) => Promise<boolean>;
  getRevision: () => number;
}

export class BookProgressRequestError extends Error {
  constructor(
    readonly status: number,
    readonly currentRevision: number | null = null,
  ) {
    super("Book progress request failed.");
    this.name = "BookProgressRequestError";
  }
}

export const chapterDurationSeconds = 132;
export const playbackChangedEvent = "adaptive-audio-player.playback-changed";
export const playbackDefaultsChangedEvent =
  "adaptive-audio-player.playback-defaults-changed";
const playbackDefaultsStorageKey = "adaptive-audio-player.playback.defaults";
const progressWriteIntervalMs = 15_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseBookProgress(value: unknown): BookProgress | null {
  if (!isRecord(value)) {
    return null;
  }

  const {
    artifactId,
    bookId,
    chapterIndex,
    durationSeconds,
    positionSeconds,
    revision,
    speed,
    updatedAt,
  } = value;
  if (
    typeof bookId !== "string" ||
    typeof artifactId !== "string" ||
    typeof positionSeconds !== "number" ||
    !Number.isFinite(positionSeconds) ||
    positionSeconds < 0 ||
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    positionSeconds > durationSeconds ||
    typeof speed !== "number" ||
    !Number.isFinite(speed) ||
    speed < 0.25 ||
    speed > 4 ||
    (chapterIndex !== null &&
      (typeof chapterIndex !== "number" ||
        !Number.isSafeInteger(chapterIndex) ||
        chapterIndex < 0)) ||
    typeof revision !== "number" ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    typeof updatedAt !== "string" ||
    !Number.isFinite(new Date(updatedAt).getTime())
  ) {
    return null;
  }

  return {
    bookId,
    artifactId,
    positionSeconds,
    durationSeconds,
    speed,
    chapterIndex: chapterIndex as number | null,
    revision,
    updatedAt,
  };
}

async function readJsonRecord(response: Response): Promise<Record<string, unknown>> {
  const value = await response.json().catch(() => null);
  return isRecord(value) ? value : {};
}

function normalizeProgressSnapshot(
  snapshot: BookProgressSnapshot,
): BookProgressSnapshot | null {
  const chapterIndex = snapshot.chapterIndex;
  if (
    !Number.isFinite(snapshot.positionSeconds) ||
    snapshot.positionSeconds < 0 ||
    !Number.isFinite(snapshot.durationSeconds) ||
    snapshot.durationSeconds <= 0 ||
    snapshot.positionSeconds > snapshot.durationSeconds ||
    !Number.isFinite(snapshot.speed) ||
    snapshot.speed < 0.25 ||
    snapshot.speed > 4 ||
    (chapterIndex !== null &&
      (!Number.isSafeInteger(chapterIndex) || chapterIndex < 0))
  ) {
    return null;
  }

  return {
    positionSeconds: snapshot.positionSeconds,
    durationSeconds: snapshot.durationSeconds,
    speed: snapshot.speed,
    chapterIndex,
  };
}

function progressSnapshotsMatch(
  left: BookProgressSnapshot | null,
  right: BookProgressSnapshot,
) {
  return (
    left?.positionSeconds === right.positionSeconds &&
    left.durationSeconds === right.durationSeconds &&
    left.speed === right.speed &&
    left.chapterIndex === right.chapterIndex
  );
}

export async function loadBookProgress(
  bookId: string,
  signal?: AbortSignal,
): Promise<BookProgress | null> {
  const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/progress`, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { accept: "application/json" },
    signal,
  });
  const payload = await readJsonRecord(response);
  if (!response.ok) {
    throw new BookProgressRequestError(response.status);
  }

  if (payload.progress === null) {
    return null;
  }

  const progress = parseBookProgress(payload.progress);
  if (!progress) {
    throw new BookProgressRequestError(502);
  }

  return progress;
}

export async function putBookProgress({
  artifactId,
  bookId,
  keepalive = false,
  revision,
  snapshot,
}: PutBookProgressRequest): Promise<BookProgress> {
  const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/progress`, {
    method: "PUT",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      artifactId,
      positionSeconds: snapshot.positionSeconds,
      durationSeconds: snapshot.durationSeconds,
      speed: snapshot.speed,
      chapterIndex: snapshot.chapterIndex,
      revision,
    }),
    keepalive,
  });
  const payload = await readJsonRecord(response);
  if (!response.ok) {
    const currentRevision = payload.currentRevision;
    throw new BookProgressRequestError(
      response.status,
      typeof currentRevision === "number" &&
        Number.isSafeInteger(currentRevision) &&
        currentRevision >= 0
        ? currentRevision
        : null,
    );
  }

  const progress = parseBookProgress(payload.progress);
  if (!progress) {
    throw new BookProgressRequestError(502);
  }

  return progress;
}

export function createBookProgressWriter({
  artifactId,
  bookId,
  initialRevision,
  intervalMs = progressWriteIntervalMs,
  now = Date.now,
  send = putBookProgress,
}: {
  artifactId: string;
  bookId: string;
  initialRevision: number;
  intervalMs?: number;
  now?: () => number;
  send?: (request: PutBookProgressRequest) => Promise<BookProgress>;
}): BookProgressWriter {
  let revision = initialRevision;
  let lastAttemptAt = now();
  let lastSavedSnapshot: BookProgressSnapshot | null = null;
  let pendingSnapshot: BookProgressSnapshot | null = null;
  let queue: Promise<boolean> = Promise.resolve(false);

  function enqueue(keepalive: boolean) {
    const run = queue.then(async () => {
      const snapshot = pendingSnapshot;
      if (!snapshot || progressSnapshotsMatch(lastSavedSnapshot, snapshot)) {
        if (snapshot) {
          pendingSnapshot = null;
        }
        return false;
      }

      try {
        const progress = await send({
          artifactId,
          bookId,
          keepalive,
          revision,
          snapshot,
        });
        revision = progress.revision;
        lastSavedSnapshot = snapshot;
        if (pendingSnapshot === snapshot) {
          pendingSnapshot = null;
        }
        return true;
      } catch (error) {
        if (
          error instanceof BookProgressRequestError &&
          error.currentRevision !== null
        ) {
          revision = error.currentRevision;
        }
        return false;
      }
    });
    queue = run;
    return run;
  }

  function retain(snapshot: BookProgressSnapshot) {
    const normalized = normalizeProgressSnapshot(snapshot);
    if (!normalized) {
      return false;
    }
    pendingSnapshot = normalized;
    return true;
  }

  return {
    async record(snapshot) {
      if (!retain(snapshot)) {
        return false;
      }

      const currentTime = now();
      if (currentTime - lastAttemptAt < intervalMs) {
        return false;
      }
      lastAttemptAt = currentTime;
      return enqueue(false);
    },
    async flush(snapshot, options = {}) {
      if (!retain(snapshot)) {
        return false;
      }
      lastAttemptAt = now();
      return enqueue(options.keepalive ?? false);
    },
    getRevision() {
      return revision;
    },
  };
}

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
    const playbackArtifactKind =
      parsed.playbackArtifactKind === "sample-generation" ||
      parsed.playbackArtifactKind === "full-book-generation"
        ? parsed.playbackArtifactKind
        : null;
    return {
      ...parsed,
      playbackArtifactKind,
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
  options: { notify?: boolean } = {},
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
  if (options.notify !== false) {
    window.dispatchEvent(new Event(playbackChangedEvent));
  }
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
