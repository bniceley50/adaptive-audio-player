"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useMediaController } from "@/components/player/use-media-controller";
import type { GenerationChapterTiming } from "@/lib/backend/types";
import type { Chapter } from "@/lib/types/models";
import {
  clearPlaybackDefaults,
  createBookProgressWriter,
  formatBookmarkLabel,
  formatPlaybackTime,
  loadBookProgress,
  readPlaybackDefaults,
  readPersistedPlaybackState,
  resolvePreferredPlaybackState,
  writePersistedPlaybackState,
  type BookProgressSnapshot,
  type BookProgressWriter,
  type PlaybackDefaults,
  type PersistedBookmark,
  type PersistedPlaybackState,
} from "@/lib/playback/local-playback";
import {
  clearLegacySavedQuotes,
} from "@/lib/library/local-quotes";

const noChapterTimings: readonly GenerationChapterTiming[] = [];

export function NowPlaying({
  artifactId = null,
  audioKind,
  audioUrl,
  bookId,
  bookTitle,
  chapters,
  chapterTimings = noChapterTimings,
  initialJumpTarget,
  initialPlaybackDefaults,
  initialPlaybackState,
  narratorName,
  playbackIsReady,
}: {
  artifactId?: string | null;
  audioKind:
    | "sample-generation"
    | "full-book-generation"
    | null;
  audioUrl: string | null;
  bookId: string;
  bookTitle: string;
  chapters: Chapter[];
  chapterTimings?: readonly GenerationChapterTiming[];
  initialJumpTarget?: { chapterIndex: number; progressSeconds: number } | null;
  initialPlaybackDefaults?: PlaybackDefaults | null;
  initialPlaybackState?: PersistedPlaybackState | null;
  narratorName: string;
  playbackIsReady: boolean;
}) {
  const [persistedState, setPersistedState] =
    useState<PersistedPlaybackState | null>(initialPlaybackState ?? null);
  const progressWriterRef = useRef<BookProgressWriter | null>(null);
  const userControlledResumeKeyRef = useRef<string | null>(null);
  const [hasHydratedPersistedState, setHasHydratedPersistedState] =
    useState(false);
  const [appliedResumeKey, setAppliedResumeKey] = useState<string | null>(null);
  const playbackDefaults = useMemo(
    () => readPlaybackDefaults() ?? initialPlaybackDefaults ?? null,
    [initialPlaybackDefaults],
  );
  const initialChapterIndex = Math.min(
    initialJumpTarget?.chapterIndex ?? persistedState?.currentChapterIndex ?? 0,
    Math.max(chapters.length - 1, 0),
  );
  const initialProgressSeconds =
    initialJumpTarget?.progressSeconds ?? persistedState?.progressSeconds ?? 0;
  const initialSpeed = persistedState?.speed ?? playbackDefaults?.speed ?? 1;
  const initialSleepTimerMinutes =
    persistedState?.sleepTimerMinutes ?? playbackDefaults?.sleepTimerMinutes ?? null;
  const [currentChapterIndex, setCurrentChapterIndex] = useState(initialChapterIndex);
  const [bookmarks, setBookmarks] = useState<PersistedBookmark[]>(
    persistedState?.bookmarks ?? [],
  );
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(
    initialSleepTimerMinutes,
  );
  const [sleepDeadline, setSleepDeadline] = useState<number | null>(() =>
    initialSleepTimerMinutes
      ? Date.now() + initialSleepTimerMinutes * 60 * 1_000
      : null,
  );
  const [chapterQuery, setChapterQuery] = useState("");

  useEffect(() => {
    clearLegacySavedQuotes();
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    progressWriterRef.current = null;
    setHasHydratedPersistedState(false);
    setAppliedResumeKey(null);

    async function hydratePlaybackState() {
      const localState = resolvePreferredPlaybackState(
        readPersistedPlaybackState(bookId),
        initialPlaybackState ?? null,
      );
      let serverProgress = null;

      if (
        artifactId &&
        (audioKind === "sample-generation" ||
          audioKind === "full-book-generation")
      ) {
        try {
          serverProgress = await loadBookProgress(
            bookId,
            abortController.signal,
          );
        } catch {
          if (abortController.signal.aborted) {
            return;
          }
        }
      }

      if (abortController.signal.aborted) {
        return;
      }

      if (artifactId) {
        progressWriterRef.current = createBookProgressWriter({
          artifactId,
          bookId,
          initialRevision: serverProgress?.revision ?? 0,
        });
      }

      let nextPersistedState = localState;
      if (serverProgress?.artifactId === artifactId) {
        const serverChapterIndex = Math.min(
          serverProgress.chapterIndex ?? 0,
          Math.max(chapters.length - 1, 0),
        );
        const serverPlaybackState: PersistedPlaybackState = {
          currentChapterIndex: serverChapterIndex,
          progressSeconds: Math.max(serverProgress.positionSeconds, 0),
          speed: serverProgress.speed,
          isBookmarked: localState?.isBookmarked ?? false,
          bookmarks: localState?.bookmarks ?? [],
          sleepTimerMinutes:
            localState?.sleepTimerMinutes ??
            playbackDefaults?.sleepTimerMinutes ??
            null,
          playbackArtifactKind: audioKind,
          updatedAt: serverProgress.updatedAt,
        };
        nextPersistedState = resolvePreferredPlaybackState(
          localState,
          serverPlaybackState,
        );
      }

      const nextChapterIndex = Math.min(
        initialJumpTarget?.chapterIndex ??
          nextPersistedState?.currentChapterIndex ??
          0,
        Math.max(chapters.length - 1, 0),
      );
      const nextSleepTimerMinutes =
        nextPersistedState?.sleepTimerMinutes ??
        playbackDefaults?.sleepTimerMinutes ??
        null;

      if (nextPersistedState) {
        writePersistedPlaybackState(bookId, nextPersistedState, {
          notify: false,
        });
      }
      setPersistedState(nextPersistedState);
      setCurrentChapterIndex(nextChapterIndex);
      setBookmarks(nextPersistedState?.bookmarks ?? []);
      setSleepTimerMinutes(nextSleepTimerMinutes);
      setSleepDeadline(
        nextSleepTimerMinutes
          ? Date.now() + nextSleepTimerMinutes * 60 * 1_000
          : null,
      );
      setHasHydratedPersistedState(true);
    }

    void hydratePlaybackState();

    return () => {
      abortController.abort();
      progressWriterRef.current = null;
    };
  }, [
    artifactId,
    audioKind,
    bookId,
    chapters.length,
    initialJumpTarget?.chapterIndex,
    initialPlaybackState,
    playbackDefaults?.sleepTimerMinutes,
  ]);

  const resumeSourceKey = audioUrl ? `${bookId}:${audioUrl}` : null;
  const media = useMediaController({
    initialPlaybackRate: initialSpeed,
    initialTime: initialProgressSeconds,
    onSleepDeadlineReached: () => {
      setSleepTimerMinutes(null);
      setSleepDeadline(null);
    },
    sleepDeadline,
    sourceKey: audioUrl,
  });
  const pauseMedia = media.pause;
  const seekMedia = media.seek;
  const currentChapter = chapters[currentChapterIndex];
  const totalSeconds = Math.max(media.duration, 0);
  const progressSeconds = Math.max(Math.floor(media.currentTime), 0);
  const filteredChapters = useMemo(() => {
    const normalizedQuery = chapterQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return chapters.map((chapter, index) => ({ chapter, index }));
    }

    return chapters
      .map((chapter, index) => ({ chapter, index }))
      .filter(({ chapter, index }) => {
        const chapterNumber = `chapter ${index + 1}`;
        return (
          chapter.title.toLowerCase().includes(normalizedQuery) ||
          chapterNumber.includes(normalizedQuery)
        );
      });
  }, [chapterQuery, chapters]);
  const latestBookmark = bookmarks[0] ?? null;
  const progressPercent = totalSeconds
    ? Math.min(Math.round((progressSeconds / totalSeconds) * 100), 100)
    : 0;
  const remainingSeconds = Math.max(
    Math.floor(totalSeconds - progressSeconds),
    0,
  );
  const remainingBookSeconds = Math.max(
    Math.floor(media.duration - media.currentTime),
    0,
  );
  const speedLabel = `${media.playbackRate.toFixed(2).replace(/\.00$/, "")}x`;
  const sleepTimerLabel = sleepTimerMinutes ? `${sleepTimerMinutes} min` : "Off";
  const isBookmarked = bookmarks.some(
    (bookmark) =>
      bookmark.chapterIndex === currentChapterIndex &&
      bookmark.progressSeconds === progressSeconds,
  );

  const exactChapterTimings = useMemo(() => {
    if (
      audioKind !== "full-book-generation" ||
      chapterTimings.length !== chapters.length
    ) {
      return [];
    }

    return chapterTimings.every(
      (timing, index) =>
        timing.chapterIndex === index &&
        Number.isFinite(timing.startSeconds) &&
        timing.startSeconds >= 0 &&
        Number.isFinite(timing.durationSeconds) &&
        timing.durationSeconds > 0,
    )
      ? chapterTimings
      : [];
  }, [audioKind, chapterTimings, chapters.length]);

  function resolveChapterStartSeconds(index: number) {
    const exactStart = exactChapterTimings[index]?.startSeconds;
    if (Number.isFinite(exactStart)) {
      return Math.max(exactStart ?? 0, 0);
    }

    if (audioKind !== "full-book-generation" || totalSeconds <= 0) {
      return 0;
    }

    const chapterWeights = chapters.map((chapter) =>
      Math.max(chapter.title.length + chapter.text.length, 1),
    );
    const totalWeight = chapterWeights.reduce(
      (total, weight) => total + weight,
      0,
    );
    const precedingWeight = chapterWeights
      .slice(0, index)
      .reduce((total, weight) => total + weight, 0);
    return totalWeight > 0 ? (precedingWeight / totalWeight) * totalSeconds : 0;
  }

  useEffect(() => {
    if (exactChapterTimings.length === 0) {
      return;
    }

    let activeChapterIndex = 0;
    for (const timing of exactChapterTimings) {
      if (media.currentTime + 0.001 < timing.startSeconds) {
        break;
      }
      activeChapterIndex = timing.chapterIndex;
    }
    if (activeChapterIndex !== currentChapterIndex) {
      setCurrentChapterIndex(activeChapterIndex);
    }
  }, [currentChapterIndex, exactChapterTimings, media.currentTime]);

  const readCurrentProgressSnapshot = useEffectEvent(
    (
      audio: HTMLAudioElement,
      options: { ended?: boolean } = {},
    ): BookProgressSnapshot | null => {
      const duration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : media.duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        return null;
      }

      const rawPosition = options.ended ? duration : audio.currentTime;
      const positionSeconds = Math.min(Math.max(rawPosition, 0), duration);
      const chapterIndex = currentChapterIndex;

      return {
        positionSeconds,
        durationSeconds: duration,
        speed: audio.playbackRate,
        chapterIndex,
      };
    },
  );

  const elapsedLabel = useMemo(
    () => formatPlaybackTime(progressSeconds),
    [progressSeconds],
  );
  const remainingLabel = useMemo(
    () => formatPlaybackTime(remainingSeconds),
    [remainingSeconds],
  );
  const remainingBookLabel = useMemo(
    () => formatPlaybackTime(remainingBookSeconds),
    [remainingBookSeconds],
  );
  useEffect(() => {
    if (
      !hasHydratedPersistedState ||
      !playbackIsReady ||
      !resumeSourceKey ||
      appliedResumeKey === resumeSourceKey
    ) {
      return;
    }

    const audio = media.audioRef.current;
    if (!audio) {
      return;
    }

    if (userControlledResumeKeyRef.current === resumeSourceKey) {
      setAppliedResumeKey(resumeSourceKey);
      return;
    }

    const applyResumePosition = () => {
      if (
        audio.readyState < 1 ||
        audio.seekable.length === 0 ||
        appliedResumeKey === resumeSourceKey
      ) {
        return;
      }

      const latestPersistedState = resolvePreferredPlaybackState(
        readPersistedPlaybackState(bookId),
        initialPlaybackState ?? null,
      );
      const resumeChapterIndex = Math.min(
        initialJumpTarget?.chapterIndex ??
          latestPersistedState?.currentChapterIndex ??
          0,
        Math.max(chapters.length - 1, 0),
      );
      const resumeProgressSeconds =
        initialJumpTarget?.progressSeconds ??
        latestPersistedState?.progressSeconds ??
        0;
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      const requestedTime = resumeProgressSeconds;
      const targetTime = duration
        ? Math.min(requestedTime, duration)
        : requestedTime;
      setCurrentChapterIndex(resumeChapterIndex);

      if (targetTime > 0) {
        seekMedia(targetTime);
      }
      pauseMedia();

      if (
        targetTime === 0 ||
        Math.abs(audio.currentTime - targetTime) <= 0.25
      ) {
        setAppliedResumeKey(resumeSourceKey);
      }
    };

    applyResumePosition();
    audio.addEventListener("canplay", applyResumePosition);
    audio.addEventListener("durationchange", applyResumePosition);
    audio.addEventListener("loadeddata", applyResumePosition);
    audio.addEventListener("loadedmetadata", applyResumePosition);
    audio.addEventListener("progress", applyResumePosition);
    audio.addEventListener("seeked", applyResumePosition);

    return () => {
      audio.removeEventListener("canplay", applyResumePosition);
      audio.removeEventListener("durationchange", applyResumePosition);
      audio.removeEventListener("loadeddata", applyResumePosition);
      audio.removeEventListener("loadedmetadata", applyResumePosition);
      audio.removeEventListener("progress", applyResumePosition);
      audio.removeEventListener("seeked", applyResumePosition);
    };
  }, [
    appliedResumeKey,
    bookId,
    chapters.length,
    hasHydratedPersistedState,
    initialJumpTarget?.chapterIndex,
    initialJumpTarget?.progressSeconds,
    initialPlaybackState,
    media.audioRef,
    pauseMedia,
    playbackIsReady,
    resumeSourceKey,
    seekMedia,
  ]);

  useEffect(() => {
    if (!initialJumpTarget) {
      return;
    }

    setCurrentChapterIndex(
      Math.min(initialJumpTarget.chapterIndex, Math.max(chapters.length - 1, 0)),
    );
    seekMedia(initialJumpTarget.progressSeconds);
    pauseMedia();
  }, [
    chapters.length,
    initialJumpTarget,
    pauseMedia,
    seekMedia,
  ]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !hasHydratedPersistedState ||
      !audioUrl ||
      !playbackIsReady ||
      (resumeSourceKey !== null && appliedResumeKey !== resumeSourceKey)
    ) {
      return;
    }

    const payload: PersistedPlaybackState = {
      currentChapterIndex,
      progressSeconds,
      speed: media.playbackRate,
      isBookmarked,
      bookmarks,
      sleepTimerMinutes,
      playbackArtifactKind: audioKind,
    };

    writePersistedPlaybackState(bookId, payload, { notify: false });

    const audio = media.audioRef.current;
    const progressSnapshot = audio
      ? readCurrentProgressSnapshot(audio)
      : null;
    if (artifactId && progressSnapshot) {
      void progressWriterRef.current?.record(progressSnapshot);
    }
  }, [
    artifactId,
    audioKind,
    audioUrl,
    appliedResumeKey,
    bookId,
    currentChapterIndex,
    hasHydratedPersistedState,
    bookmarks,
    isBookmarked,
    progressSeconds,
    sleepTimerMinutes,
    media.currentTime,
    media.duration,
    media.playbackRate,
    playbackIsReady,
    resumeSourceKey,
    media.audioRef,
  ]);

  useEffect(() => {
    if (
      !artifactId ||
      !hasHydratedPersistedState ||
      !playbackIsReady ||
      (resumeSourceKey !== null && appliedResumeKey !== resumeSourceKey)
    ) {
      return;
    }

    const audio = media.audioRef.current;
    const writer = progressWriterRef.current;
    if (!audio || !writer) {
      return;
    }
    const liveAudio = audio;
    const liveWriter = writer;

    function flushProgress(options: { ended?: boolean; keepalive?: boolean } = {}) {
      const snapshot = readCurrentProgressSnapshot(liveAudio, {
        ended: options.ended,
      });
      if (snapshot) {
        void liveWriter.flush(snapshot, { keepalive: options.keepalive });
      }
    }

    function handlePause() {
      flushProgress();
    }

    function handleSeeked() {
      flushProgress();
    }

    function handleEnded() {
      flushProgress({ ended: true });
    }

    function handleUnload() {
      flushProgress({ keepalive: true });
    }

    liveAudio.addEventListener("pause", handlePause);
    liveAudio.addEventListener("seeked", handleSeeked);
    liveAudio.addEventListener("ended", handleEnded);
    window.addEventListener("pagehide", handleUnload);
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      liveAudio.removeEventListener("pause", handlePause);
      liveAudio.removeEventListener("seeked", handleSeeked);
      liveAudio.removeEventListener("ended", handleEnded);
      window.removeEventListener("pagehide", handleUnload);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [
    appliedResumeKey,
    artifactId,
    hasHydratedPersistedState,
    media.audioRef,
    playbackIsReady,
    resumeSourceKey,
  ]);

  function togglePlayback() {
    if (!playbackIsReady) {
      return;
    }

    userControlledResumeKeyRef.current = resumeSourceKey;
    void media.togglePlayback();
  }

  function skipBackward() {
    userControlledResumeKeyRef.current = resumeSourceKey;
    media.skip(-15);
  }

  function skipForward() {
    userControlledResumeKeyRef.current = resumeSourceKey;
    media.skip(30);
  }

  function cycleSpeed() {
    const nextSpeed =
      media.playbackRate >= 1.5
        ? 0.9
        : Number((media.playbackRate + 0.15).toFixed(2));
    media.setPlaybackRate(nextSpeed);
  }

  function cycleSleepTimer() {
    const nextMinutes =
      sleepTimerMinutes === null ? 15 : sleepTimerMinutes === 15 ? 30 : null;
    setSleepTimerMinutes(nextMinutes);
    setSleepDeadline(
      nextMinutes ? Date.now() + nextMinutes * 60 * 1_000 : null,
    );
  }

  function selectChapter(index: number) {
    userControlledResumeKeyRef.current = resumeSourceKey;
    setCurrentChapterIndex(index);
    media.seek(resolveChapterStartSeconds(index));
    media.pause();
  }

  function toggleBookmark() {
    const existingBookmark = bookmarks.find(
      (bookmark) =>
        bookmark.chapterIndex === currentChapterIndex &&
        bookmark.progressSeconds === progressSeconds,
    );

    if (existingBookmark) {
      setBookmarks((currentBookmarks) =>
        currentBookmarks.filter((bookmark) => bookmark.id !== existingBookmark.id),
      );
      return;
    }

    const nextBookmark: PersistedBookmark = {
      id: `${currentChapterIndex}-${progressSeconds}-${Date.now()}`,
      chapterIndex: currentChapterIndex,
      progressSeconds,
      createdAt: new Date().toISOString(),
    };

    setBookmarks((currentBookmarks) => [nextBookmark, ...currentBookmarks]);
  }

  function jumpToBookmark(bookmark: PersistedBookmark) {
    userControlledResumeKeyRef.current = resumeSourceKey;
    setCurrentChapterIndex(bookmark.chapterIndex);
    media.seek(bookmark.progressSeconds);
    media.pause();
  }

  function removeBookmark(bookmarkId: string) {
    setBookmarks((currentBookmarks) =>
      currentBookmarks.filter((bookmark) => bookmark.id !== bookmarkId),
    );
  }

  function resetPlaybackDefaults() {
    clearPlaybackDefaults();
  }

  const handleKeyboardShortcut = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const isTypingContext =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target?.isContentEditable;

    if (isTypingContext) {
      return;
    }

    const key = event.key.toLowerCase();

    if (event.code === "Space") {
      event.preventDefault();
      togglePlayback();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      skipBackward();
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      skipForward();
      return;
    }

    if (key === "b") {
      event.preventDefault();
      toggleBookmark();
      return;
    }

    if (key === "s") {
      event.preventDefault();
      cycleSleepTimer();
      return;
    }

    if (key === "v") {
      event.preventDefault();
      cycleSpeed();
      return;
    }

    if (key === "n") {
      event.preventDefault();
      selectChapter(Math.min(currentChapterIndex + 1, chapters.length - 1));
      return;
    }

    if (key === "p") {
      event.preventDefault();
      selectChapter(Math.max(currentChapterIndex - 1, 0));
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);

    function handleKeydown(event: KeyboardEvent) {
      handleKeyboardShortcut(event);
    }
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-hidden rounded-[var(--radius-xl)] bg-[var(--player-bg-2)] p-6 text-[var(--player-text)] lg:p-8">
        <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:gap-10">
          <div className="w-44 shrink-0 overflow-hidden rounded-[var(--radius-lg)] bg-gradient-to-br from-[var(--player-bg-3)] to-[var(--player-bg-1)] shadow-[4px_4px_24px_rgba(0,0,0,0.45)] lg:w-52" style={{ aspectRatio: "2 / 3" }}>
            <div className="relative flex h-full flex-col justify-between p-5">
              <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-b from-black/30 via-black/10 to-black/30" />
              <p className="font-[var(--font-display)] text-xl font-medium leading-tight text-[var(--player-accent)]">{bookTitle}</p>
              <div>
                <div className="mb-2 h-px w-8 bg-[var(--player-accent)] opacity-40" />
                <p className="text-[0.65rem] uppercase tracking-[0.18em] text-[var(--player-text-soft)]">{narratorName}</p>
              </div>
            </div>
          </div>
          <div className="min-w-0 flex-1 text-center lg:text-left">
            <h2 className="font-[var(--font-display)] text-3xl font-semibold text-white lg:text-4xl">{bookTitle}</h2>
            <p className="mt-2 text-sm text-[var(--player-text-soft)]">
              Narrated by {narratorName}
            </p>
            <p className="mt-1 text-sm text-[var(--player-text-muted)]">
              {currentChapter?.title ?? "No chapter loaded"}
            </p>
        <div className="mt-6">
          <div
            aria-busy={media.isSeeking}
            aria-label="Playback progress"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progressPercent}
            className="h-1.5 rounded-full bg-white/10"
            role="progressbar"
          >
            <div
              className="h-1.5 rounded-full bg-[var(--player-accent)] transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-[var(--player-text-muted)]">
            <span>{elapsedLabel}</span>
            <span>-{remainingLabel} · {remainingBookLabel} left</span>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-center gap-5 lg:justify-start">
              <button
                className="rounded-full border border-[var(--player-border)] bg-[var(--player-panel)] px-4 py-2 text-sm text-[var(--player-text-soft)] transition hover:bg-white/10"
                type="button"
                onClick={skipBackward}
              >
                Back 15
              </button>
              <button
                className={`rounded-full px-6 py-3 text-base font-semibold shadow-sm transition ${
                  playbackIsReady
                    ? "bg-[var(--player-accent)] text-[var(--player-bg-1)] hover:opacity-90"
                    : "bg-white/10 text-[var(--player-text-muted)]"
                }`}
                disabled={!playbackIsReady}
                type="button"
                onClick={togglePlayback}
              >
                {playbackIsReady
                  ? media.isPlaying
                    ? "Pause"
                    : "Play"
                  : "Audio locked"}
              </button>
              <button
                className="rounded-full border border-[var(--player-border)] bg-[var(--player-panel)] px-4 py-2 text-sm text-[var(--player-text-soft)] transition hover:bg-white/10"
                type="button"
                onClick={skipForward}
              >
                Forward 30
              </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm lg:justify-start">
          <button
            className="rounded-full border border-[var(--player-border)] bg-[var(--player-panel)] px-4 py-2 text-[var(--player-text-soft)] transition hover:bg-white/10"
            type="button"
            onClick={cycleSpeed}
          >
            {speedLabel}
          </button>
          <button
            className={`rounded-full border px-4 py-2 transition ${
              isBookmarked
                ? "border-[var(--player-accent)] bg-[var(--player-accent)] text-[var(--player-bg-1)]"
                : "border-[var(--player-border)] bg-[var(--player-panel)] text-[var(--player-text-soft)] hover:bg-white/10"
            }`}
            type="button"
            onClick={toggleBookmark}
          >
            {isBookmarked ? "Bookmarked" : "Bookmark"}
          </button>
          <button
            className="rounded-full border border-[var(--player-border)] bg-[var(--player-panel)] px-4 py-2 text-[var(--player-text-soft)] transition hover:bg-white/10"
            type="button"
            onClick={cycleSleepTimer}
          >
            Sleep: {sleepTimerLabel}
          </button>
        </div>
        {media.error ? (
          <p
            className="mt-4 text-sm text-red-200"
            role="alert"
          >
            {media.error}
          </p>
        ) : null}
          </div>
        </div>
        {audioUrl ? (
          <audio
            ref={media.audioRef}
            className="hidden"
            preload="metadata"
            src={audioUrl}
          />
        ) : null}
      </section>

      <section className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--line)] bg-[var(--paper)] p-6">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
          <h3 className="text-lg font-semibold text-[var(--ink)]">Chapters</h3>
          <span className="rounded-full bg-[var(--paper-2)] px-3 py-1 text-xs font-medium text-[var(--ink-soft)]">
            {currentChapterIndex + 1} / {chapters.length}
          </span>
        </div>
        <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--paper-2)]/50 p-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <p className="text-sm text-[var(--ink-soft)]">
              Jump to a chapter
            </p>
            <div className="min-w-[14rem] flex-1 max-w-sm">
              <input
                className="w-full rounded-full border border-[var(--line-strong)] bg-white px-4 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
                placeholder="Search chapters..."
                type="text"
                value={chapterQuery}
                onChange={(event) => setChapterQuery(event.target.value)}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {filteredChapters.map(({ chapter, index }) => (
            <button
              key={chapter.id}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                currentChapterIndex === index
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                  : "border-[var(--line)] bg-white text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:bg-[var(--paper-2)]"
              }`}
              type="button"
              onClick={() => selectChapter(index)}
            >
              {chapter.title}
            </button>
            ))}
            {filteredChapters.length === 0 ? (
              <p className="rounded-full border border-dashed border-stone-300 px-4 py-2 text-sm text-stone-500">
                No chapters match that search yet.
              </p>
            ) : null}
          </div>
        </div>
        <h3 className="mt-5 text-xl font-semibold text-[var(--ink)]">
          {currentChapter?.title ?? "No chapter loaded"}
        </h3>
        <p className="mt-3 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--paper-2)]/40 p-4 text-sm leading-7 text-[var(--ink-soft)]">
          {currentChapter?.text.slice(0, 280) ??
            "No imported draft found yet. Return to import and carry a chapter through setup first."}
        </p>
        <div className="mt-6 rounded-[var(--radius-xl)] border border-[var(--line)] bg-[var(--paper)] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="text-lg font-semibold text-stone-900">Bookmarks</h4>
              <p className="mt-1 text-sm text-stone-600">
                Save important moments and jump back to them later.
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
              {bookmarks.length}
            </span>
          </div>
          {playbackDefaults ? (
            <div className="mt-4 rounded-[1.4rem] border border-dashed border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
              <p className="font-medium text-stone-900">
                Playback defaults: {playbackDefaults.speed.toFixed(2).replace(/\.00$/, "")}x
                {" · "}
                {playbackDefaults.sleepTimerMinutes
                  ? `${playbackDefaults.sleepTimerMinutes} min timer`
                  : "timer off"}
              </p>
              <button
                className="mt-3 rounded-full border border-[var(--line-strong)] px-4 py-2 text-sm font-medium text-[var(--ink-soft)] transition hover:bg-[var(--paper-2)]"
                type="button"
                onClick={resetPlaybackDefaults}
              >
                Clear playback defaults
              </button>
            </div>
          ) : null}
          {latestBookmark ? (
            <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--accent-soft)] bg-[var(--accent-soft)]/30 px-4 py-4 text-sm text-[var(--ink-soft)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-xl">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">
                    Jump back in
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[var(--ink)]">
                    {formatBookmarkLabel(
                      chapters[latestBookmark.chapterIndex]?.title ??
                        `Chapter ${latestBookmark.chapterIndex + 1}`,
                      latestBookmark.progressSeconds,
                    )}
                  </p>
                  <p className="mt-2 leading-6 text-stone-600">
                    Your most recent saved moment is ready to resume instantly.
                  </p>
                </div>
                <button
                  className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)]"
                  type="button"
                  onClick={() => jumpToBookmark(latestBookmark)}
                >
                  Resume from bookmark
                </button>
              </div>
            </div>
          ) : null}
          {bookmarks.length > 0 ? (
            <div className="mt-4 grid gap-3">
              {bookmarks.map((bookmark) => {
                const bookmarkChapter = chapters[bookmark.chapterIndex];
                const bookmarkLabel = formatBookmarkLabel(
                  bookmarkChapter?.title ?? `Chapter ${bookmark.chapterIndex + 1}`,
                  bookmark.progressSeconds,
                );

                return (
                  <div
                    key={bookmark.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--line)] bg-white px-4 py-3 text-sm text-stone-700 shadow-sm"
                  >
                    <div>
                      <p className="font-medium text-stone-900">{bookmarkLabel}</p>
                      <p className="mt-1 text-stone-500">
                        Saved {new Date(bookmark.createdAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)]"
                        type="button"
                        onClick={() => jumpToBookmark(bookmark)}
                      >
                        Jump to bookmark
                      </button>
                      <button
                        className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-sm font-medium text-[var(--ink-soft)] transition hover:bg-[var(--paper-2)]"
                        type="button"
                        onClick={() => removeBookmark(bookmark.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-stone-600">
              No bookmarks saved yet for this book.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
