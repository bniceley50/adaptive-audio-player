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
}

function computeLocalListeningStats(): ListeningStats {
  const books = readLocalLibraryBooks();
  let activeBooks = 0;
  let totalBookmarks = 0;
  let listenedSeconds = 0;
  let activeChapters = 0;

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
  }

  return {
    activeBooks,
    totalBookmarks,
    listenedMinutes: Math.max(0, Math.round(listenedSeconds / 60)),
    activeChapters,
  };
}

export function ListeningStatsCard({
  initialStats,
}: {
  initialStats: ListeningStats;
}) {
  const [stats, setStats] = useState<ListeningStats>(initialStats);

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
      </div>
    </section>
  );
}
