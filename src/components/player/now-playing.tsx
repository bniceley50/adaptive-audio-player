"use client";

import { useEffect, useMemo, useState } from "react";
import type { Chapter } from "@/lib/types/models";
import {
  chapterDurationSeconds,
  clearPlaybackDefaults,
  formatBookmarkLabel,
  formatPlaybackTime,
  getPlaybackPercent,
  readPlaybackDefaults,
  readPersistedPlaybackState,
  writePlaybackDefaults,
  writePersistedPlaybackState,
  type PersistedBookmark,
  type PersistedPlaybackState,
} from "@/lib/playback/local-playback";
import { touchLocalLibraryBook } from "@/lib/library/local-library";

export function NowPlaying({
  audioKind,
  audioUrl,
  bookId,
  bookTitle,
  chapters,
  narratorName,
  mode,
  playbackIsReady,
}: {
  audioKind: "sample-generation" | "full-book-generation" | null;
  audioUrl: string | null;
  bookId: string;
  bookTitle: string;
  chapters: Chapter[];
  narratorName: string;
  mode: string;
  playbackIsReady: boolean;
}) {
  const persistedState = useMemo(
    () => readPersistedPlaybackState(bookId),
    [bookId],
  );
  const playbackDefaults = useMemo(() => readPlaybackDefaults(), []);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(
    Math.min(persistedState?.currentChapterIndex ?? 0, Math.max(chapters.length - 1, 0)),
  );
  const [progressSeconds, setProgressSeconds] = useState(
    persistedState?.progressSeconds ?? 43,
  );
  const [speed, setSpeed] = useState(
    persistedState?.speed ?? playbackDefaults?.speed ?? 1,
  );
  const [bookmarks, setBookmarks] = useState<PersistedBookmark[]>(
    persistedState?.bookmarks ?? [],
  );
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(
    persistedState?.sleepTimerMinutes ?? playbackDefaults?.sleepTimerMinutes ?? null,
  );

  const totalSeconds = chapterDurationSeconds;
  const currentChapter = chapters[currentChapterIndex];
  const progressPercent = getPlaybackPercent(progressSeconds);
  const remainingSeconds = Math.max(totalSeconds - progressSeconds, 0);
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

  function togglePlayback() {
    if (!playbackIsReady) {
      return;
    }

    setIsPlaying((value) => !value);
  }

  function skipBackward() {
    setProgressSeconds((value) => Math.max(value - 15, 0));
  }

  function skipForward() {
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
    setCurrentChapterIndex(bookmark.chapterIndex);
    setProgressSeconds(bookmark.progressSeconds);
    setIsPlaying(false);
  }

  function removeBookmark(bookmarkId: string) {
    setBookmarks((currentBookmarks) =>
      currentBookmarks.filter((bookmark) => bookmark.id !== bookmarkId),
    );
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
                      : "Pause sample"
                    : audioKind === "full-book-generation"
                      ? "Play full book"
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
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(180deg,#fffefb_0%,#ffffff_100%)] p-6 shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200/80 pb-5">
          <div className="max-w-xl">
            <p className="text-sm uppercase tracking-[0.22em] text-stone-500">
              {audioKind === "full-book-generation" ? "Full-book audio" : "Sample preview"}
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-stone-950">
              {audioKind === "full-book-generation"
                ? "Generated full-book playback"
                : "Generated sample playback"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Move between chapters, review the source text, and keep your listening
              preferences locked to this book.
            </p>
          </div>
          <div className="rounded-[1.4rem] border border-stone-200 bg-stone-50/80 px-4 py-3 shadow-sm">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
              Chapter status
            </p>
            <p className="mt-2 text-lg font-semibold text-stone-950">
              {currentChapterIndex + 1} / {chapters.length}
            </p>
          </div>
        </div>
        {audioUrl ? (
          <div className="mt-5 rounded-[1.6rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-5 shadow-sm">
            <p className="text-sm font-medium text-stone-900">
              {audioKind === "full-book-generation"
                ? "Generated full-book audio"
                : "Generated sample audio"}
            </p>
            <p className="mt-1 text-sm text-stone-600">
              {audioKind === "full-book-generation"
                ? "This is the backend-rendered full-book output from the worker queue."
                : "This is the backend-rendered narration for the current sample setup."}
            </p>
            <audio
              className="mt-4 w-full"
              controls
              preload="metadata"
              src={audioUrl}
            />
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-3">
          {chapters.map((chapter, index) => (
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
        </div>
        <h3 className="mt-6 text-2xl font-semibold text-stone-950">
          {currentChapter?.title ?? "No chapter loaded"}
        </h3>
        <p className="mt-4 rounded-[1.5rem] border border-stone-200 bg-stone-50/70 p-5 text-sm leading-7 text-stone-600">
          {currentChapter?.text.slice(0, 280) ??
            "No imported draft found yet. Return to import and carry a chapter through setup first."}
        </p>
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
