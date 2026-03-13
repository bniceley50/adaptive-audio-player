"use client";

import { useEffect, useState } from "react";
import {
  libraryChangedEvent,
  readLocalLibraryBooks,
} from "@/lib/library/local-library";
import { workspaceContextChangedEvent } from "@/lib/library/local-state";
import { readPersistedPlaybackState } from "@/lib/playback/local-playback";

interface ListeningStats {
  activeBooks: number;
  totalBookmarks: number;
  listenedMinutes: number;
  activeChapters: number;
  topBookTitle: string | null;
  recentBooks: number;
  listeningStreakDays: number;
}

function calculateListeningStreak(updatedAtValues: string[]): number {
  const dayKeys = [...new Set(
    updatedAtValues
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()))
      .map((value) => {
        const normalized = new Date(value);
        normalized.setHours(0, 0, 0, 0);
        return normalized.getTime();
      }),
  )].sort((left, right) => right - left);

  if (dayKeys.length === 0) {
    return 0;
  }

  let streak = 0;
  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  for (const dayKey of dayKeys) {
    if (dayKey === cursor.getTime()) {
      streak += 1;
      cursor = new Date(cursor.getTime() - 1000 * 60 * 60 * 24);
      continue;
    }

    if (streak === 0 && dayKey === cursor.getTime() - 1000 * 60 * 60 * 24) {
      streak += 1;
      cursor = new Date(dayKey - 1000 * 60 * 60 * 24);
      continue;
    }

    break;
  }

  return streak;
}

function deriveListeningPulse(stats: ListeningStats) {
  if (stats.listenedMinutes >= 180 || stats.activeBooks >= 4) {
    return {
      label: "Deep in the stack",
      detail:
        "You are actively moving through multiple books. This is a great moment to lock in a default taste and keep your library consistent.",
      hint: "Try promoting your favorite narrator + mode as the default for new imports.",
      accent: "from-amber-100 via-orange-50 to-white",
      badge: "High momentum",
    };
  }

  if (stats.totalBookmarks >= 3 || stats.activeChapters >= 6) {
    return {
      label: "Exploring with intent",
      detail:
        "You are sampling, bookmarking, and moving around books like a serious listener. The app is starting to understand your rhythm.",
      hint: "Use bookmarks and sample/full-book compare to decide which taste deserves a full render.",
      accent: "from-sky-100 via-cyan-50 to-white",
      badge: "Discovery mode",
    };
  }

  if (stats.activeBooks >= 1 || stats.listenedMinutes > 0) {
    return {
      label: "Getting your bearings",
      detail:
        "You have started listening, which is enough to shape smarter defaults and better resume behavior across the library.",
      hint: "Generate one strong sample, then save that taste as your default for the next import.",
      accent: "from-emerald-100 via-lime-50 to-white",
      badge: "Building taste",
    };
  }

  return {
    label: "Fresh library",
    detail:
      "You have a clean slate. Load the guided demo or import a book to start building a listening profile worth syncing everywhere.",
    hint: "A single finished sample is enough to make the dashboard feel alive.",
    accent: "from-stone-100 via-stone-50 to-white",
    badge: "Ready to start",
  };
}

function computeLocalListeningStats(): ListeningStats {
  const books = readLocalLibraryBooks();
  let activeBooks = 0;
  let totalBookmarks = 0;
  let listenedSeconds = 0;
  let activeChapters = 0;
  let recentBooks = 0;
  let topBookTitle: string | null = null;
  let topBookScore = -1;
  const updatedAtValues: string[] = [];

  for (const book of books) {
    const playback = readPersistedPlaybackState(book.bookId);
    if (!playback) {
      continue;
    }

    if (playback.progressSeconds > 0 || (playback.bookmarks?.length ?? 0) > 0) {
      activeBooks += 1;
    }

    totalBookmarks += playback.bookmarks?.length ?? 0;
    listenedSeconds += playback.progressSeconds;
    activeChapters += playback.currentChapterIndex + 1;

    const updatedAt = new Date(playback.updatedAt ?? 0).getTime();
    if (Date.now() - updatedAt < 1000 * 60 * 60 * 24 * 7) {
      recentBooks += 1;
    }
    if (playback.updatedAt) {
      updatedAtValues.push(playback.updatedAt);
    }

    const score =
      playback.progressSeconds + (playback.bookmarks?.length ?? 0) * 60;
    if (score > topBookScore) {
      topBookScore = score;
      topBookTitle = book.title;
    }
  }

  return {
    activeBooks,
    totalBookmarks,
    listenedMinutes: Math.max(0, Math.round(listenedSeconds / 60)),
    activeChapters,
    topBookTitle,
    recentBooks,
    listeningStreakDays: calculateListeningStreak(updatedAtValues),
  };
}

export function ListeningStatsCard({
  initialStats,
}: {
  initialStats: ListeningStats;
}) {
  const [stats, setStats] = useState<ListeningStats>(initialStats);
  const pulse = deriveListeningPulse(stats);
  const weeklyGoalMinutes = 120;
  const weeklyGoalProgress = Math.min(
    100,
    Math.round((stats.listenedMinutes / weeklyGoalMinutes) * 100),
  );
  const weeklyGoalRemaining = Math.max(weeklyGoalMinutes - stats.listenedMinutes, 0);

  useEffect(() => {
    function refreshStats() {
      setStats(computeLocalListeningStats());
    }

    refreshStats();
    window.addEventListener(libraryChangedEvent, refreshStats);
    window.addEventListener(workspaceContextChangedEvent, refreshStats);

    return () => {
      window.removeEventListener(libraryChangedEvent, refreshStats);
      window.removeEventListener(workspaceContextChangedEvent, refreshStats);
    };
  }, []);

  return (
    <section className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
            Listening pulse
          </p>
          <h2 className="mt-2 text-lg font-semibold text-stone-900">
            Your library has momentum
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            Quick stats for how much listening is already happening across your synced
            books.
          </p>
        </div>
        <div className="rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-sm text-stone-600 shadow-sm">
          Updated from your current library state
        </div>
      </div>
      <div
        className={`mt-5 rounded-[1.6rem] border border-stone-200 bg-[linear-gradient(135deg,var(--tw-gradient-stops))] ${pulse.accent} p-5 shadow-sm`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-stone-950 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-white">
                Listening pulse
              </span>
              <span className="rounded-full border border-stone-200 bg-white/80 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-stone-700 shadow-sm">
                {pulse.badge}
              </span>
            </div>
            <h3 className="mt-3 text-xl font-semibold text-stone-950">{pulse.label}</h3>
            <p className="mt-2 text-sm leading-6 text-stone-700">{pulse.detail}</p>
          </div>
          <div className="max-w-sm rounded-[1.25rem] border border-stone-200 bg-white/85 px-4 py-4 text-sm text-stone-700 shadow-sm backdrop-blur">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
              Best next move
            </p>
            <p className="mt-2 leading-6">{pulse.hint}</p>
          </div>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[1.4rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Active books
          </p>
          <p className="mt-2 text-2xl font-semibold text-stone-950">{stats.activeBooks}</p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Bookmarks
          </p>
          <p className="mt-2 text-2xl font-semibold text-stone-950">{stats.totalBookmarks}</p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Minutes heard
          </p>
          <p className="mt-2 text-2xl font-semibold text-stone-950">{stats.listenedMinutes}</p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Chapters touched
          </p>
          <p className="mt-2 text-2xl font-semibold text-stone-950">{stats.activeChapters}</p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Listening streak
          </p>
          <p className="mt-2 text-2xl font-semibold text-stone-950">
            {stats.listeningStreakDays} day{stats.listeningStreakDays === 1 ? "" : "s"}
          </p>
        </article>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <article className="rounded-[1.4rem] border border-stone-200 bg-[linear-gradient(180deg,#fff7ed_0%,#ffffff_100%)] p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
                Weekly listening goal
              </p>
              <p className="mt-2 text-xl font-semibold text-stone-950">
                {stats.listenedMinutes} / {weeklyGoalMinutes} min
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                {weeklyGoalRemaining > 0
                  ? `${weeklyGoalRemaining} more minutes to hit this week’s goal.`
                  : "Goal reached. Keep listening and build momentum."}
              </p>
            </div>
            <span className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-amber-700 shadow-sm">
              {weeklyGoalProgress}% there
            </span>
          </div>
          <div className="mt-4 h-2.5 rounded-full bg-amber-100">
            <div
              className="h-2.5 rounded-full bg-[linear-gradient(90deg,#f59e0b_0%,#fbbf24_100%)] transition-all"
              style={{ width: `${weeklyGoalProgress}%` }}
            />
          </div>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-[linear-gradient(180deg,#fcfbf8_0%,#ffffff_100%)] p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Most active title
          </p>
          <p className="mt-2 text-lg font-semibold text-stone-950">
            {stats.topBookTitle ?? "No standout title yet"}
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {stats.topBookTitle
              ? "This is the title your current progress and bookmarks are clustering around."
              : "Finish one sample or start a listening session and your dashboard will spotlight the book carrying the most momentum."}
          </p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-[linear-gradient(180deg,#fcfbf8_0%,#ffffff_100%)] p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Active this week
          </p>
          <p className="mt-2 text-lg font-semibold text-stone-950">
            {stats.recentBooks} {stats.recentBooks === 1 ? "book" : "books"}
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {stats.recentBooks > 0
              ? "These titles have recent listening activity, which is why the dashboard feels alive and ready to resume."
              : "No recent listening yet. Load the guided demo or finish one sample to start building weekly momentum."}
          </p>
        </article>
      </div>
    </section>
  );
}
