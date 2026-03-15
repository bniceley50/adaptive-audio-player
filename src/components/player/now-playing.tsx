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
    <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(145deg,#111827_0%,#1c1917_42%,#292524_100%)] p-6 text-white shadow-[0_30px_90px_-50px_rgba(15,23,42,0.95)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <p className="text-sm uppercase tracking-[0.22em] text-stone-300">
              Now playing
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight">
              {currentChapter?.title ?? "No chapter loaded"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-300">
              Book: {bookTitle}
              <span className="ml-2 text-stone-400">({bookId})</span>
            </p>
          </div>
          <div className="min-w-[12rem] rounded-[1.5rem] border border-white/10 bg-white/8 px-4 py-4 shadow-sm backdrop-blur">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-300">
              Playback state
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {playbackIsReady
                ? isPlaying
                  ? "Playing"
                  : "Ready to resume"
                : "Audio locked"}
            </p>
            <p className="mt-2 text-sm leading-6 text-stone-300">
              {audioKind === "full-book-generation"
                ? "Using full-book audio"
                : audioKind === "sample-generation"
                  ? "Using generated sample audio"
                  : audioKind === "imported-audio"
                    ? "Using imported audiobook audio"
                  : "Generate audio to unlock playback"}
            </p>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.5rem] border border-white/10 bg-white/8 p-5 shadow-sm">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-300">
              Narrator
            </p>
            <p className="mt-2 text-lg font-semibold text-white">{narratorName}</p>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-white/8 p-5 shadow-sm">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-300">
              Mode
            </p>
            <p className="mt-2 text-lg font-semibold capitalize text-white">{mode}</p>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.5rem] border border-white/10 bg-white/8 p-5 shadow-sm">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-300">
              {isImportedAudio ? "Time left in section" : "Time left in chapter"}
            </p>
            <p className="mt-2 text-lg font-semibold text-white">{remainingLabel}</p>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-white/8 p-5 shadow-sm">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-300">
              Time left in book
            </p>
            <p className="mt-2 text-lg font-semibold text-white">{remainingBookLabel}</p>
          </div>
        </div>
        <div className="mt-6">
          <div className="h-2.5 rounded-full bg-white/10">
            <div
              className="h-2.5 rounded-full bg-[linear-gradient(90deg,#fcd34d_0%,#fde68a_100%)] transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-sm text-stone-300">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
              {elapsedLabel}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 transition hover:bg-white/10"
                type="button"
                onClick={skipBackward}
              >
                Back 15
              </button>
              <button
                className={`rounded-full px-5 py-2.5 font-semibold shadow-sm transition ${
                  playbackIsReady
                    ? "bg-white text-stone-950 hover:bg-stone-100"
                    : "bg-stone-700 text-stone-300"
                }`}
                type="button"
                onClick={togglePlayback}
              >
                {playbackIsReady
                  ? isPlaying
                    ? audioKind === "full-book-generation"
                      ? "Pause full book"
                      : audioKind === "imported-audio"
                        ? "Pause audiobook"
                      : "Pause sample"
                    : audioKind === "full-book-generation"
                      ? "Play full book"
                      : audioKind === "imported-audio"
                        ? "Play audiobook"
                      : "Play sample"
                  : "Audio locked"}
              </button>
              <button
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 transition hover:bg-white/10"
                type="button"
                onClick={skipForward}
              >
                Forward 30
              </button>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
              {remainingLabel}
            </span>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <button
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-stone-200 transition hover:bg-white/10"
            type="button"
            onClick={cycleSpeed}
          >
            Speed: {speedLabel}
          </button>
          <button
            className={`rounded-full border px-4 py-2 transition ${
              isBookmarked
                ? "border-amber-300 bg-amber-300 text-stone-950 shadow-[0_20px_40px_-32px_rgba(252,211,77,0.95)]"
                : "border-white/15 bg-white/5 text-stone-200 hover:bg-white/10"
            }`}
            type="button"
            onClick={toggleBookmark}
          >
            {isBookmarked ? "Bookmarked" : "Add bookmark"}
          </button>
          <button
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-stone-200 transition hover:bg-white/10"
            type="button"
            onClick={cycleSleepTimer}
          >
            Sleep timer: {sleepTimerLabel}
          </button>
          <button
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-stone-200 transition hover:bg-white/10"
            type="button"
            onClick={savePlaybackDefaults}
          >
            Save playback defaults
          </button>
        </div>
        <div className="mt-5 rounded-[1.4rem] border border-white/10 bg-white/5 p-4 shadow-sm">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-300">
            Keyboard shortcuts
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-stone-200">
            {[
              ["Space", "Play or pause"],
              ["← / →", "Skip back or forward"],
              ["B", "Toggle bookmark"],
              ["S", "Cycle sleep timer"],
              ["V", "Cycle speed"],
              ["N / P", isImportedAudio ? "Next or previous section" : "Next or previous chapter"],
            ].map(([shortcut, label]) => (
              <span
                key={shortcut}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/15 px-3 py-1.5"
              >
                <span className="rounded-full bg-white/10 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-white">
                  {shortcut}
                </span>
                <span className="text-stone-200">{label}</span>
              </span>
            ))}
          </div>
        </div>
        {audioKind !== "imported-audio" ? (
        <>
        <div className="mt-5 rounded-[1.4rem] border border-fuchsia-300/20 bg-[linear-gradient(135deg,rgba(217,70,239,0.12)_0%,rgba(255,255,255,0.06)_100%)] p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-xl">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-fuchsia-200">
                Share your taste
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {narratorName} in {mode}
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-200">
                Turn your current listening setup into a shareable card-worthy moment.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-full border border-white/20 bg-black/15 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-black/25"
                type="button"
                onClick={saveAsDefaultTaste}
              >
                Make this my default
              </button>
              <button
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-stone-950 shadow-sm transition hover:bg-fuchsia-50"
                type="button"
                onClick={() => {
                  void shareTasteCard();
                }}
              >
                {typeof navigator !== "undefined" && typeof navigator.share === "function"
                  ? "Share taste"
                  : "Copy taste"}
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-fuchsia-100">
            <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1.5">
              {bookTitle}
            </span>
            <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1.5">
              {narratorName}
            </span>
            <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1.5 capitalize">
              {mode}
            </span>
          </div>
          <div className="mt-3 space-y-1 text-sm text-fuchsia-100">
            {defaultTasteFeedback === "saved" ? (
              <p>This listening taste is now your default for new imports.</p>
            ) : null}
            {shareFeedback !== "idle" ? (
              <p>
                {shareFeedback === "shared"
                  ? "Taste shared."
                  : "Taste copied to clipboard."}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-5 rounded-[1.4rem] border border-sky-300/20 bg-[linear-gradient(135deg,rgba(14,165,233,0.14)_0%,rgba(255,255,255,0.06)_100%)] p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-xl">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-sky-100">
                Book circle
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                Invite friends into this edition
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-200">
                Share this title with the current narrator and mode so everyone starts
                from the same listening setup.
              </p>
            </div>
            <button
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-stone-950 shadow-sm transition hover:bg-sky-50"
              type="button"
              onClick={() => {
                void shareBookCircleInvite();
              }}
            >
              {typeof navigator !== "undefined" && typeof navigator.share === "function"
                ? "Share book circle"
                : "Copy circle invite"}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sky-100">
            <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1.5">
              {bookTitle}
            </span>
            <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1.5">
              {narratorName}
            </span>
            <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1.5 capitalize">
              {mode}
            </span>
            {latestQuote ? (
              <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1.5">
                Includes a saved moment
              </span>
            ) : null}
          </div>
          <div className="mt-3 space-y-1 text-sm text-sky-100">
            <p>
              Start with this listening edition, then compare notes, saved moments,
              and favorite scenes together.
            </p>
            {circleFeedback !== "idle" ? (
              <p>
                {circleFeedback === "shared"
                  ? "Book circle invite shared."
                  : "Book circle invite copied to clipboard."}
              </p>
            ) : null}
          </div>
        </div>
        </>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(180deg,#fffefb_0%,#ffffff_100%)] p-6 shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200/80 pb-5">
          <div className="max-w-xl">
            <p className="text-sm uppercase tracking-[0.22em] text-stone-500">
              {audioKind === "imported-audio"
                ? "Imported audiobook"
                : audioKind === "full-book-generation"
                  ? "Full-book audio"
                  : "Sample preview"}
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-stone-950">
              {audioKind === "imported-audio"
                ? "Original audiobook playback"
                : audioKind === "full-book-generation"
                ? "Generated full-book playback"
                : "Generated sample playback"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {audioKind === "imported-audio"
                ? "Listen to the original file, keep your progress, and save moments from the book as you go."
                : "Move between chapters, review the source text, and keep your listening preferences locked to this book."}
            </p>
          </div>
          <div className="rounded-[1.4rem] border border-stone-200 bg-stone-50/80 px-4 py-3 shadow-sm">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
              {isImportedAudio ? "Section status" : "Chapter status"}
            </p>
            <p className="mt-2 text-lg font-semibold text-stone-950">
              {currentChapterIndex + 1} / {chapters.length}
            </p>
          </div>
        </div>
        {audioUrl ? (
          <div className="mt-5 rounded-[1.6rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-5 shadow-sm">
            <p className="text-sm font-medium text-stone-900">
              {audioKind === "imported-audio"
                ? "Imported audiobook file"
                : audioKind === "full-book-generation"
                ? "Generated full-book audio"
                : "Generated sample audio"}
            </p>
            <p className="mt-1 text-sm text-stone-600">
              {audioKind === "imported-audio"
                ? "This is the original private audiobook file stored locally in this browser."
                : audioKind === "full-book-generation"
                ? "This is the backend-rendered full-book output from the worker queue."
                : "This is the backend-rendered narration for the current sample setup."}
            </p>
            <audio
              ref={audioRef}
              className="mt-4 w-full"
              controls
              preload="metadata"
              src={audioUrl}
            />
          </div>
        ) : null}
        <div className="mt-5 rounded-[1.4rem] border border-stone-200 bg-stone-50/80 p-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
                {isImportedAudio ? "Quick section jump" : "Quick chapter jump"}
              </p>
              <p className="mt-2 text-sm text-stone-600">
                {isImportedAudio
                  ? "Jump between listening sections built from the audiobook runtime."
                  : "Search by title or chapter number to move through longer books faster."}
              </p>
            </div>
            <div className="min-w-[16rem] flex-1 max-w-sm">
              <label className="block text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                {isImportedAudio ? "Find section" : "Find chapter"}
              </label>
              <input
                className="mt-2 w-full rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-stone-500"
                placeholder={isImportedAudio ? "Search section title" : "Search chapter title"}
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
                  ? "border-stone-950 bg-stone-950 text-white shadow-[0_18px_36px_-28px_rgba(28,25,23,0.65)]"
                  : "border-stone-200 bg-stone-50 text-stone-700 hover:border-stone-300 hover:bg-white"
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
        <h3 className="mt-6 text-2xl font-semibold text-stone-950">
          {currentChapter?.title ?? "No chapter loaded"}
        </h3>
        <p className="mt-4 rounded-[1.5rem] border border-stone-200 bg-stone-50/70 p-5 text-sm leading-7 text-stone-600">
          {currentChapter?.text.slice(0, 280) ??
            "No imported draft found yet. Return to import and carry a chapter through setup first."}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[1.4rem] border border-stone-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
              Save this moment
            </p>
            <p className="mt-1 text-sm text-stone-600">
              {isImportedAudio
                ? "Save memorable moments from this listening section for quick recall later."
                : "Keep memorable lines from the current chapter for quick recall later."}
            </p>
          </div>
          <button
            className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
            type="button"
            onClick={saveQuote}
          >
            Save quote
          </button>
        </div>
        <div className="mt-6 rounded-[1.6rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-5 shadow-sm">
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
            <div className="mt-4 rounded-[1.4rem] border border-rose-200 bg-[linear-gradient(135deg,#fff1f2_0%,#ffffff_100%)] px-4 py-4 text-sm text-stone-700 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-xl">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-rose-700">
                    Favorite moment
                  </p>
                  {latestQuote.pinnedAt ? (
                    <p className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-amber-700">
                      Pinned quote
                    </p>
                  ) : null}
                  <p className="mt-2 text-base font-medium italic text-stone-950">
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
                    className="rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
                    type="button"
                    onClick={() => jumpToQuote(latestQuote)}
                  >
                    Jump to quote
                  </button>
                  <button
                    className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                    type="button"
                    onClick={() => {
                      void copyQuote(latestQuote.text);
                    }}
                  >
                    Copy quote
                  </button>
                  <button
                    className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                    type="button"
                    onClick={() => togglePinnedQuote(latestQuote.id)}
                  >
                    {latestQuote.pinnedAt ? "Unpin quote" : "Pin quote"}
                  </button>
                  <button
                    className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
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
                    className="rounded-[1.4rem] border border-stone-200 bg-white px-4 py-4 text-sm text-stone-700 shadow-sm"
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
                          <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-amber-800">
                            Pinned
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <button
                          className="rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
                          type="button"
                          onClick={() => jumpToQuote(quote)}
                        >
                          Jump to quote
                        </button>
                        <button
                          className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                          type="button"
                          onClick={() => {
                            void copyQuote(quote.text);
                          }}
                        >
                          Copy
                        </button>
                        <button
                          className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                          type="button"
                          onClick={() => togglePinnedQuote(quote.id)}
                        >
                          {quote.pinnedAt ? "Unpin" : "Pin"}
                        </button>
                        <button
                          className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                          type="button"
                          onClick={() => toggleQuotePromotion(quote)}
                        >
                          {promotedMomentIds.includes(`promoted-${quote.id}`)
                            ? "Remove from social"
                            : "Promote"}
                        </button>
                        <button
                          className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
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
        <div className="mt-6 rounded-[1.6rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-5 shadow-sm">
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
                className="mt-3 rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                type="button"
                onClick={resetPlaybackDefaults}
              >
                Clear playback defaults
              </button>
            </div>
          ) : null}
          {latestBookmark ? (
            <div className="mt-4 rounded-[1.4rem] border border-amber-200 bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_100%)] px-4 py-4 text-sm text-stone-700 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-xl">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-amber-700">
                    Jump back in
                  </p>
                  <p className="mt-2 text-lg font-semibold text-stone-950">
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
                  className="rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
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
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[1.4rem] border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 shadow-sm"
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
                        className="rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
                        type="button"
                        onClick={() => jumpToBookmark(bookmark)}
                      >
                        Jump to bookmark
                      </button>
                      <button
                        className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
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
