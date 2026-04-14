"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  readPromotedSocialMoments,
  socialStateChangedEvent,
  togglePromotedSocialMoment,
} from "@/features/social/local-social";
import {
  resolveMatchingPublicCircle,
  resolveMatchingPublicEdition,
} from "@/features/social/public-moments";
import type { Chapter } from "@/lib/types/models";
import {
  chapterDurationSeconds,
  clearPlaybackDefaults,
  formatBookmarkLabel,
  formatPlaybackTime,
  getPlaybackPercent,
  readPlaybackDefaults,
  readPersistedPlaybackState,
  resolvePreferredPlaybackState,
  writePlaybackDefaults,
  writePersistedPlaybackState,
  type PlaybackDefaults,
  type PersistedBookmark,
  type PersistedPlaybackState,
} from "@/lib/playback/local-playback";
import {
  touchLocalLibraryBook,
  writeDefaultListeningProfile,
} from "@/lib/library/local-library";
import {
  readSavedQuotes,
  writeSavedQuotes,
  type SavedQuote,
} from "@/lib/library/local-quotes";

export function NowPlaying({
  audioKind,
  audioUrl,
  bookId,
  bookTitle,
  chapters,
  chapterStartSeconds,
  initialJumpTarget,
  initialPlaybackDefaults,
  initialPlaybackState,
  narratorName,
  mode,
  playbackIsReady,
  totalAudioDurationSeconds,
  experienceMode = "everyday",
}: {
  audioKind:
    | "sample-generation"
    | "full-book-generation"
    | "imported-audio"
    | null;
  audioUrl: string | null;
  bookId: string;
  bookTitle: string;
  chapters: Chapter[];
  chapterStartSeconds?: number[] | null;
  initialJumpTarget?: { chapterIndex: number; progressSeconds: number } | null;
  initialPlaybackDefaults?: PlaybackDefaults | null;
  initialPlaybackState?: PersistedPlaybackState | null;
  narratorName: string;
  mode: string;
  playbackIsReady: boolean;
  totalAudioDurationSeconds?: number | null;
  experienceMode?: "everyday" | "studio";
}) {
  function sortQuotes(quotes: SavedQuote[]) {
    return [...quotes].sort((left, right) => {
      const leftPinnedAt = left.pinnedAt ? new Date(left.pinnedAt).getTime() : 0;
      const rightPinnedAt = right.pinnedAt ? new Date(right.pinnedAt).getTime() : 0;

      if (leftPinnedAt !== rightPinnedAt) {
        return rightPinnedAt - leftPinnedAt;
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
  }

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const persistedState = useMemo(() => {
    const localState = readPersistedPlaybackState(bookId);
    return resolvePreferredPlaybackState(localState, initialPlaybackState ?? null);
  }, [bookId, initialPlaybackState]);
  const playbackDefaults = useMemo(
    () => readPlaybackDefaults() ?? initialPlaybackDefaults ?? null,
    [initialPlaybackDefaults],
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(
    Math.min(
      initialJumpTarget?.chapterIndex ?? persistedState?.currentChapterIndex ?? 0,
      Math.max(chapters.length - 1, 0),
    ),
  );
  const [progressSeconds, setProgressSeconds] = useState(
    initialJumpTarget?.progressSeconds ?? persistedState?.progressSeconds ?? 43,
  );
  const [speed, setSpeed] = useState(
    persistedState?.speed ?? playbackDefaults?.speed ?? 1,
  );
  const [bookmarks, setBookmarks] = useState<PersistedBookmark[]>(
    persistedState?.bookmarks ?? [],
  );
  const [savedQuotes, setSavedQuotes] = useState<SavedQuote[]>(() => readSavedQuotes(bookId));
  const [promotedMomentIds, setPromotedMomentIds] = useState<string[]>(() =>
    readPromotedSocialMoments().map((entry) => entry.id),
  );
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(
    persistedState?.sleepTimerMinutes ?? playbackDefaults?.sleepTimerMinutes ?? null,
  );
  const [shareFeedback, setShareFeedback] = useState<"idle" | "shared" | "copied">(
    "idle",
  );
  const [circleFeedback, setCircleFeedback] = useState<"idle" | "shared" | "copied">(
    "idle",
  );
  const [defaultTasteFeedback, setDefaultTasteFeedback] = useState<"idle" | "saved">(
    "idle",
  );
  const [chapterQuery, setChapterQuery] = useState("");
  const isImportedAudio = audioKind === "imported-audio";
  const safeChapterStarts = useMemo(() => {
    if (!chapterStartSeconds || chapterStartSeconds.length !== chapters.length) {
      return chapters.map((_, index) => index * chapterDurationSeconds);
    }

    return chapterStartSeconds;
  }, [chapterStartSeconds, chapters]);
  const effectiveTotalAudioDuration = useMemo(() => {
    if (isImportedAudio && totalAudioDurationSeconds && totalAudioDurationSeconds > 0) {
      return totalAudioDurationSeconds;
    }

    return chapters.length * chapterDurationSeconds;
  }, [chapters.length, isImportedAudio, totalAudioDurationSeconds]);
  const currentChapter = chapters[currentChapterIndex];
  const currentChapterStart = safeChapterStarts[currentChapterIndex] ?? 0;
  const nextChapterStart =
    safeChapterStarts[currentChapterIndex + 1] ?? effectiveTotalAudioDuration;
  const totalSeconds = isImportedAudio
    ? Math.max(nextChapterStart - currentChapterStart, 1)
    : chapterDurationSeconds;
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
  const latestQuote = savedQuotes[0] ?? null;
  const progressPercent = isImportedAudio
    ? Math.min(Math.round((progressSeconds / totalSeconds) * 100), 100)
    : getPlaybackPercent(progressSeconds);
  const remainingSeconds = Math.max(totalSeconds - progressSeconds, 0);
  const remainingBookSeconds = isImportedAudio
    ? Math.max(effectiveTotalAudioDuration - (currentChapterStart + progressSeconds), 0)
    : remainingSeconds + Math.max(chapters.length - currentChapterIndex - 1, 0) * totalSeconds;
  const speedLabel = `${speed.toFixed(2).replace(/\.00$/, "")}x`;
  const sleepTimerLabel = sleepTimerMinutes ? `${sleepTimerMinutes} min` : "Off";
  const isBookmarked = bookmarks.some(
    (bookmark) =>
      bookmark.chapterIndex === currentChapterIndex &&
      bookmark.progressSeconds === progressSeconds,
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
  const excerptQuoteText = useMemo(
    () => currentChapter?.text.slice(0, 180).trim() ?? "",
    [currentChapter],
  );

  useEffect(() => {
    if (!initialJumpTarget) {
      return;
    }

    setCurrentChapterIndex(
      Math.min(initialJumpTarget.chapterIndex, Math.max(chapters.length - 1, 0)),
    );
    setProgressSeconds(initialJumpTarget.progressSeconds);
    setIsPlaying(false);
  }, [chapters.length, initialJumpTarget]);

  useEffect(() => {
    if (!isImportedAudio) {
      return;
    }

    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.currentTime)) {
      return;
    }

    const targetTime = Math.min(
      currentChapterStart + progressSeconds,
      effectiveTotalAudioDuration || currentChapterStart + progressSeconds,
    );

    if (Math.abs(audio.currentTime - targetTime) > 1.25) {
      audio.currentTime = targetTime;
    }
  }, [
    currentChapterStart,
    effectiveTotalAudioDuration,
    isImportedAudio,
    progressSeconds,
  ]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    if (!isImportedAudio) {
      return;
    }

    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    const liveAudio = audio;

    function syncTimeline() {
      const absoluteProgress = liveAudio.currentTime;
      const nextChapterIndex = Math.max(
        0,
        safeChapterStarts.findIndex((start, index) => {
          const nextStart = safeChapterStarts[index + 1] ?? Number.POSITIVE_INFINITY;
          return absoluteProgress >= start && absoluteProgress < nextStart;
        }),
      );
      const resolvedChapterIndex =
        nextChapterIndex === -1 ? Math.max(safeChapterStarts.length - 1, 0) : nextChapterIndex;
      const chapterStart = safeChapterStarts[resolvedChapterIndex] ?? 0;

      setCurrentChapterIndex((currentIndex) =>
        currentIndex === resolvedChapterIndex ? currentIndex : resolvedChapterIndex,
      );
      setProgressSeconds(Math.max(Math.floor(absoluteProgress - chapterStart), 0));
    }

    function handlePlay() {
      setIsPlaying(true);
    }

    function handlePause() {
      setIsPlaying(false);
      syncTimeline();
    }

    liveAudio.addEventListener("timeupdate", syncTimeline);
    liveAudio.addEventListener("loadedmetadata", syncTimeline);
    liveAudio.addEventListener("seeked", syncTimeline);
    liveAudio.addEventListener("play", handlePlay);
    liveAudio.addEventListener("pause", handlePause);

    return () => {
      liveAudio.removeEventListener("timeupdate", syncTimeline);
      liveAudio.removeEventListener("loadedmetadata", syncTimeline);
      liveAudio.removeEventListener("seeked", syncTimeline);
      liveAudio.removeEventListener("play", handlePlay);
      liveAudio.removeEventListener("pause", handlePause);
    };
  }, [isImportedAudio, safeChapterStarts]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const payload: PersistedPlaybackState = {
      currentChapterIndex,
      progressSeconds,
      speed,
      isBookmarked,
      bookmarks,
      sleepTimerMinutes,
      playbackArtifactKind: audioKind,
    };

    writePersistedPlaybackState(bookId, payload);
    touchLocalLibraryBook(bookId);
  }, [
    audioKind,
    bookId,
    currentChapterIndex,
    bookmarks,
    isBookmarked,
    progressSeconds,
    sleepTimerMinutes,
    speed,
  ]);

  useEffect(() => {
    writeSavedQuotes(bookId, savedQuotes);
  }, [bookId, savedQuotes]);

  useEffect(() => {
    function refreshPromotedMoments() {
      setPromotedMomentIds(readPromotedSocialMoments().map((entry) => entry.id));
    }

    refreshPromotedMoments();
    window.addEventListener(socialStateChangedEvent, refreshPromotedMoments);
    return () => {
      window.removeEventListener(socialStateChangedEvent, refreshPromotedMoments);
    };
  }, []);

  function toggleQuotePromotion(quote: SavedQuote) {
    const matchingEdition = resolveMatchingPublicEdition({
      bookTitle,
      narratorName,
      mode,
    });
    const matchingCircle = resolveMatchingPublicCircle(matchingEdition?.id ?? null);

    togglePromotedSocialMoment({
      id: `promoted-${quote.id}`,
      bookId,
      bookTitle,
      chapterIndex: quote.chapterIndex,
      chapterLabel: chapters[quote.chapterIndex]?.title ?? `Chapter ${quote.chapterIndex + 1}`,
      progressSeconds: quote.progressSeconds,
      quoteText: quote.text,
      promotedAt: new Date().toISOString(),
      editionId: matchingEdition?.id ?? null,
      circleId: matchingCircle?.id ?? null,
    });
  }

  function togglePlayback() {
    if (!playbackIsReady) {
      return;
    }

    if (isImportedAudio) {
      const audio = audioRef.current;
      if (!audio) {
        return;
      }

      if (audio.paused) {
        void audio.play();
      } else {
        audio.pause();
      }
      return;
    }

    setIsPlaying((value) => !value);
  }

  function skipBackward() {
    if (isImportedAudio) {
      const audio = audioRef.current;
      if (!audio) {
        return;
      }

      audio.currentTime = Math.max(audio.currentTime - 15, 0);
      return;
    }

    setProgressSeconds((value) => Math.max(value - 15, 0));
  }

  function skipForward() {
    if (isImportedAudio) {
      const audio = audioRef.current;
      if (!audio) {
        return;
      }

      audio.currentTime = Math.min(audio.currentTime + 30, effectiveTotalAudioDuration);
      return;
    }

    setProgressSeconds((value) => Math.min(value + 30, totalSeconds));
  }

  function cycleSpeed() {
    const nextSpeed = speed >= 1.5 ? 0.9 : Number((speed + 0.15).toFixed(2));
    setSpeed(nextSpeed);
  }

  function cycleSleepTimer() {
    setSleepTimerMinutes((value) => {
      if (value === null) {
        return 15;
      }

      if (value === 15) {
        return 30;
      }

      return null;
    });
  }

  function selectChapter(index: number) {
    if (isImportedAudio) {
      const audio = audioRef.current;
      const start = safeChapterStarts[index] ?? 0;
      if (audio) {
        audio.currentTime = start;
        audio.pause();
      }
      setCurrentChapterIndex(index);
      setProgressSeconds(0);
      setIsPlaying(false);
      return;
    }

    setCurrentChapterIndex(index);
    setProgressSeconds(0);
    setIsPlaying(false);
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
    if (isImportedAudio) {
      const audio = audioRef.current;
      const start = safeChapterStarts[bookmark.chapterIndex] ?? 0;
      if (audio) {
        audio.currentTime = start + bookmark.progressSeconds;
        audio.pause();
      }
    }
    setCurrentChapterIndex(bookmark.chapterIndex);
    setProgressSeconds(bookmark.progressSeconds);
    setIsPlaying(false);
  }

  function jumpToQuote(quote: SavedQuote) {
    if (isImportedAudio) {
      const audio = audioRef.current;
      const start = safeChapterStarts[quote.chapterIndex] ?? 0;
      if (audio) {
        audio.currentTime = start + quote.progressSeconds;
        audio.pause();
      }
    }
    setCurrentChapterIndex(quote.chapterIndex);
    setProgressSeconds(quote.progressSeconds);
    setIsPlaying(false);
  }

  function removeBookmark(bookmarkId: string) {
    setBookmarks((currentBookmarks) =>
      currentBookmarks.filter((bookmark) => bookmark.id !== bookmarkId),
    );
  }

  function saveQuote() {
    if (!excerptQuoteText) {
      return;
    }

    const duplicateQuote = savedQuotes.find(
      (quote) =>
        quote.chapterIndex === currentChapterIndex && quote.text === excerptQuoteText,
    );

    if (duplicateQuote) {
      setSavedQuotes((currentQuotes) =>
        sortQuotes([
          duplicateQuote,
          ...currentQuotes.filter((quote) => quote.id !== duplicateQuote.id),
        ]),
      );
      return;
    }

    const nextQuote: SavedQuote = {
      id: `${currentChapterIndex}-${progressSeconds}-${Date.now()}`,
      bookId,
      chapterIndex: currentChapterIndex,
      progressSeconds,
      text: excerptQuoteText,
      createdAt: new Date().toISOString(),
      pinnedAt: null,
    };

    setSavedQuotes((currentQuotes) =>
      sortQuotes([nextQuote, ...currentQuotes]).slice(0, 12),
    );
  }

  function removeQuote(quoteId: string) {
    setSavedQuotes((currentQuotes) =>
      currentQuotes.filter((quote) => quote.id !== quoteId),
    );
  }

  function togglePinnedQuote(quoteId: string) {
    setSavedQuotes((currentQuotes) =>
      sortQuotes(
        currentQuotes.map((quote) =>
          quote.id === quoteId
            ? {
                ...quote,
                pinnedAt: quote.pinnedAt ? null : new Date().toISOString(),
              }
            : quote,
        ),
      ),
    );
  }

  async function copyQuote(quoteText: string) {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(quoteText);
  }

  function savePlaybackDefaults() {
    writePlaybackDefaults({
      speed,
      sleepTimerMinutes,
    });
  }

  function resetPlaybackDefaults() {
    clearPlaybackDefaults();
  }

  async function shareTasteCard() {
    const shareText = `I’m listening to ${bookTitle} with ${narratorName} in ${mode} mode on Adaptive Audio Player.`;
    const shareUrl =
      typeof window !== "undefined" ? window.location.href : "https://github.com/bniceley50/adaptive-audio-player";

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `${bookTitle} · ${narratorName} · ${mode}`,
          text: shareText,
          url: shareUrl,
        });
        setShareFeedback("shared");
        return;
      } catch {
        // Fall through to clipboard copy when native share is dismissed or unavailable.
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setShareFeedback("copied");
    }
  }

  async function shareBookCircleInvite() {
    const inviteText = latestQuote
      ? `Join my book circle for ${bookTitle}. Start with ${narratorName} in ${mode} mode, then jump to this saved moment: “${latestQuote.text}”`
      : `Join my book circle for ${bookTitle}. Start with ${narratorName} in ${mode} mode and listen together on Adaptive Audio Player.`;
    const shareUrl =
      typeof window !== "undefined" ? window.location.href : "https://github.com/bniceley50/adaptive-audio-player";

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `${bookTitle} · Book circle`,
          text: inviteText,
          url: shareUrl,
        });
        setCircleFeedback("shared");
        return;
      } catch {
        // Fall through to clipboard copy when native share is dismissed or unavailable.
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(`${inviteText}\n${shareUrl}`);
      setCircleFeedback("copied");
    }
  }

  function saveAsDefaultTaste() {
    writeDefaultListeningProfile({
      bookId,
      narratorId: narratorName.toLowerCase().replace(/\s+/g, "-"),
      narratorName,
      mode,
    });
    setDefaultTasteFeedback("saved");
    window.setTimeout(() => setDefaultTasteFeedback("idle"), 1800);
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
              {narratorName} · <span className="capitalize">{mode}</span>
            </p>
            <p className="mt-1 text-sm text-[var(--player-text-muted)]">
              {currentChapter?.title ?? "No chapter loaded"}
            </p>
        <div className="mt-6">
          <div className="h-1.5 rounded-full bg-white/10">
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
                type="button"
                onClick={togglePlayback}
              >
                {playbackIsReady
                  ? isPlaying
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
          {experienceMode === "studio" ? (
          <button
            className="rounded-full border border-[var(--player-border)] bg-[var(--player-panel)] px-4 py-2 text-[var(--player-text-soft)] transition hover:bg-white/10"
            type="button"
            onClick={savePlaybackDefaults}
          >
            Save defaults
          </button>
          ) : null}
        </div>
          </div>
        </div>
        {audioUrl ? (
          <audio ref={audioRef} className="hidden" preload="metadata" src={audioUrl} />
        ) : null}
        {experienceMode === "studio" ? (
        <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--player-border)] bg-[var(--player-panel)] p-4">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[var(--player-text-muted)]">
            Keyboard shortcuts
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--player-text-soft)]">
            {[
              ["Space", "Play / pause"],
              ["← / →", "Skip"],
              ["B", "Bookmark"],
              ["S", "Sleep"],
              ["V", "Speed"],
              ["N / P", "Chapter"],
            ].map(([shortcut, label]) => (
              <span
                key={shortcut}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--player-border)] bg-black/15 px-2.5 py-1"
              >
                <span className="text-[0.6rem] font-semibold uppercase text-white">{shortcut}</span>
                <span>{label}</span>
              </span>
            ))}
          </div>
        </div>
        ) : null}
        {experienceMode === "studio" && audioKind !== "imported-audio" ? (
        <>
        <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--player-border)] bg-[var(--player-panel)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[var(--player-text-muted)]">
                Share your taste
              </p>
              <p className="mt-2 text-sm text-[var(--player-text-soft)]">
                {narratorName} in {mode}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-full border border-[var(--player-border)] bg-[var(--player-panel)] px-3 py-1.5 text-sm text-[var(--player-text-soft)] transition hover:bg-white/10"
                type="button"
                onClick={saveAsDefaultTaste}
              >
                Make default
              </button>
              <button
                className="rounded-full bg-[var(--player-accent)] px-3 py-1.5 text-sm font-medium text-[var(--player-bg-1)] transition hover:opacity-90"
                type="button"
                onClick={() => { void shareTasteCard(); }}
              >
                {typeof navigator !== "undefined" && typeof navigator.share === "function" ? "Share" : "Copy"}
              </button>
            </div>
          </div>
          {defaultTasteFeedback === "saved" ? (
            <p className="mt-2 text-sm text-[var(--player-text-muted)]">Saved as default.</p>
          ) : null}
          {shareFeedback !== "idle" ? (
            <p className="mt-2 text-sm text-[var(--player-text-muted)]">
              {shareFeedback === "shared" ? "Shared." : "Copied."}
            </p>
          ) : null}
        </div>
        <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--player-border)] bg-[var(--player-panel)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[var(--player-text-muted)]">
                Book circle
              </p>
              <p className="mt-2 text-sm text-[var(--player-text-soft)]">
                Invite friends into this edition
              </p>
            </div>
            <button
              className="rounded-full bg-[var(--player-accent)] px-3 py-1.5 text-sm font-medium text-[var(--player-bg-1)] transition hover:opacity-90"
              type="button"
              onClick={() => { void shareBookCircleInvite(); }}
            >
              {typeof navigator !== "undefined" && typeof navigator.share === "function" ? "Share" : "Copy invite"}
            </button>
          </div>
          {circleFeedback !== "idle" ? (
            <p className="mt-2 text-sm text-[var(--player-text-muted)]">
              {circleFeedback === "shared" ? "Shared." : "Copied."}
            </p>
          ) : null}
        </div>
        </>
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
              {isImportedAudio ? "Jump between sections" : "Jump to a chapter"}
            </p>
            <div className="min-w-[14rem] flex-1 max-w-sm">
              <input
                className="w-full rounded-full border border-[var(--line-strong)] bg-white px-4 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
                placeholder={isImportedAudio ? "Search sections..." : "Search chapters..."}
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
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--line)] bg-white px-4 py-3">
          <p className="text-sm text-[var(--ink-soft)]">Save a moment from this chapter</p>
          <button
            className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-sm font-medium text-[var(--ink-soft)] transition hover:bg-[var(--paper-2)]"
            type="button"
            onClick={saveQuote}
          >
            Save quote
          </button>
        </div>
        <div className="mt-6 rounded-[var(--radius-xl)] border border-[var(--line)] bg-[var(--paper)] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="text-lg font-semibold text-stone-900">Saved quotes</h4>
              <p className="mt-1 text-sm text-stone-600">
                Keep standout lines and copy them later.
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
              {savedQuotes.length}
            </span>
          </div>
          {latestQuote ? (
            <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--accent-soft)] bg-[var(--accent-soft)]/30 px-4 py-4 text-sm text-[var(--ink-soft)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-xl">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">
                    Favorite moment
                  </p>
                  {latestQuote.pinnedAt ? (
                    <p className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
                      Pinned quote
                    </p>
                  ) : null}
                  <p className="mt-2 text-base font-medium italic text-[var(--ink)]">
                    “{latestQuote.text}”
                  </p>
                  <p className="mt-2 leading-6 text-stone-600">
                    {chapters[latestQuote.chapterIndex]?.title ??
                      `Chapter ${latestQuote.chapterIndex + 1}`}
                    {" · "}
                    {formatPlaybackTime(latestQuote.progressSeconds)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)]"
                    type="button"
                    onClick={() => jumpToQuote(latestQuote)}
                  >
                    Jump to quote
                  </button>
                  <button
                    className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-sm font-medium text-[var(--ink-soft)] transition hover:bg-[var(--paper-2)]"
                    type="button"
                    onClick={() => {
                      void copyQuote(latestQuote.text);
                    }}
                  >
                    Copy quote
                  </button>
                  <button
                    className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-sm font-medium text-[var(--ink-soft)] transition hover:bg-[var(--paper-2)]"
                    type="button"
                    onClick={() => togglePinnedQuote(latestQuote.id)}
                  >
                    {latestQuote.pinnedAt ? "Unpin quote" : "Pin quote"}
                  </button>
                  <button
                    className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-sm font-medium text-[var(--ink-soft)] transition hover:bg-[var(--paper-2)]"
                    type="button"
                    onClick={() => toggleQuotePromotion(latestQuote)}
                  >
                    {promotedMomentIds.includes(`promoted-${latestQuote.id}`)
                      ? "Remove from social"
                      : "Promote to social"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {savedQuotes.length > 0 ? (
            <div className="mt-4 grid gap-3">
              {savedQuotes.map((quote) => {
                const quoteChapter = chapters[quote.chapterIndex];

                return (
                  <div
                    key={quote.id}
                    className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-white px-4 py-4 text-sm text-stone-700 shadow-sm"
                  >
                    <p className="text-base font-medium italic text-stone-950">“{quote.text}”</p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2 text-stone-500">
                        <p>
                          {quoteChapter?.title ?? `Chapter ${quote.chapterIndex + 1}`}
                          {" · "}
                          {formatPlaybackTime(quote.progressSeconds)}
                        </p>
                        {quote.pinnedAt ? (
                          <span className="rounded-full border border-[var(--accent-soft)] bg-[var(--accent-soft)] px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                            Pinned
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <button
                          className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)]"
                          type="button"
                          onClick={() => jumpToQuote(quote)}
                        >
                          Jump to quote
                        </button>
                        <button
                          className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-sm font-medium text-[var(--ink-soft)] transition hover:bg-[var(--paper-2)]"
                          type="button"
                          onClick={() => {
                            void copyQuote(quote.text);
                          }}
                        >
                          Copy
                        </button>
                        <button
                          className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-sm font-medium text-[var(--ink-soft)] transition hover:bg-[var(--paper-2)]"
                          type="button"
                          onClick={() => togglePinnedQuote(quote.id)}
                        >
                          {quote.pinnedAt ? "Unpin" : "Pin"}
                        </button>
                        <button
                          className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-sm font-medium text-[var(--ink-soft)] transition hover:bg-[var(--paper-2)]"
                          type="button"
                          onClick={() => toggleQuotePromotion(quote)}
                        >
                          {promotedMomentIds.includes(`promoted-${quote.id}`)
                            ? "Remove from social"
                            : "Promote"}
                        </button>
                        <button
                          className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-sm font-medium text-[var(--ink-soft)] transition hover:bg-[var(--paper-2)]"
                          type="button"
                          onClick={() => removeQuote(quote.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-stone-600">
              No saved quotes yet for this book.
            </p>
          )}
        </div>
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
