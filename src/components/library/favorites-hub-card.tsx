"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  defaultTasteChangedEvent,
  libraryChangedEvent,
  readDefaultListeningProfile,
  readLocalLibraryBook,
  readLocalLibraryBooks,
  type LocalListeningProfile,
} from "@/lib/library/local-library";
import { readAllSavedQuotes, savedQuotesChangedEvent } from "@/lib/library/local-quotes";
import {
  formatPlaybackTime,
  playbackChangedEvent,
  readPersistedPlaybackState,
  type PersistedBookmark,
} from "@/lib/playback/local-playback";
import { workspaceContextChangedEvent } from "@/lib/library/local-state";

type FavoriteBookmark = PersistedBookmark & {
  bookId: string;
  bookTitle: string | null;
};

function readLatestBookmark(): FavoriteBookmark | null {
  const books = readLocalLibraryBooks();
  const bookmarks: FavoriteBookmark[] = [];

  for (const book of books) {
    const playback = readPersistedPlaybackState(book.bookId);
    if (!playback?.bookmarks?.length) {
      continue;
    }

    for (const bookmark of playback.bookmarks) {
      bookmarks.push({
        ...bookmark,
        bookId: book.bookId,
        bookTitle: book.title,
      });
    }
  }

  return (
    bookmarks.sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )[0] ?? null
  );
}

export function FavoritesHubCard() {
  const [defaultTaste, setDefaultTaste] = useState<LocalListeningProfile | null>(() =>
    readDefaultListeningProfile(),
  );
  const [latestBookmark, setLatestBookmark] = useState<FavoriteBookmark | null>(() =>
    readLatestBookmark(),
  );
  const [latestQuote, setLatestQuote] = useState(() => readAllSavedQuotes()[0] ?? null);

  useEffect(() => {
    function refresh() {
      setDefaultTaste(readDefaultListeningProfile());
      setLatestBookmark(readLatestBookmark());
      setLatestQuote(readAllSavedQuotes()[0] ?? null);
    }

    refresh();
    window.addEventListener(defaultTasteChangedEvent, refresh);
    window.addEventListener(libraryChangedEvent, refresh);
    window.addEventListener(playbackChangedEvent, refresh);
    window.addEventListener(savedQuotesChangedEvent, refresh);
    window.addEventListener(workspaceContextChangedEvent, refresh);

    return () => {
      window.removeEventListener(defaultTasteChangedEvent, refresh);
      window.removeEventListener(libraryChangedEvent, refresh);
      window.removeEventListener(playbackChangedEvent, refresh);
      window.removeEventListener(savedQuotesChangedEvent, refresh);
      window.removeEventListener(workspaceContextChangedEvent, refresh);
    };
  }, []);

  const topBook = useMemo(() => {
    if (latestQuote?.bookId) {
      return readLocalLibraryBook(latestQuote.bookId);
    }

    if (latestBookmark?.bookId) {
      return readLocalLibraryBook(latestBookmark.bookId);
    }

    if (defaultTaste?.bookId) {
      return readLocalLibraryBook(defaultTaste.bookId);
    }

    return null;
  }, [defaultTaste, latestBookmark, latestQuote]);

  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#fffdf7_0%,#ffffff_42%,#eef4ff_100%)] shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
      <div className="border-b border-stone-200/80 bg-white/85 p-6 backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              Favorites hub
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-900">
              Your quickest way back in
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Keep your best taste, latest moment, and easiest resume point in one
              place.
            </p>
          </div>
          {topBook ? (
            <div className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-600 shadow-sm">
              Centered on {topBook.title}
            </div>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 p-6 md:grid-cols-3">
        <article className="rounded-[1.4rem] border border-stone-200 bg-white/90 p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Favorite taste
          </p>
          <p className="mt-2 text-lg font-semibold text-stone-950">
            {defaultTaste
              ? `${defaultTaste.narratorName} in ${defaultTaste.mode}`
              : "No default taste yet"}
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {defaultTaste
              ? "This is the listening edition new books will start from."
              : "Save a default taste from setup or playback to make new books feel familiar."}
          </p>
          {defaultTaste ? (
            <Link
              className="mt-4 inline-flex rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
              href="/#default-taste"
            >
              Review default
            </Link>
          ) : null}
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-white/90 p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Latest bookmark
          </p>
          <p className="mt-2 text-lg font-semibold text-stone-950">
            {latestBookmark?.bookTitle ?? "No saved bookmark yet"}
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {latestBookmark
              ? `Chapter ${latestBookmark.chapterIndex + 1} · ${formatPlaybackTime(latestBookmark.progressSeconds)}`
              : "Bookmark a moment in the player to get a one-tap way back in."}
          </p>
          {latestBookmark ? (
            <Link
              className="mt-4 inline-flex rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
              href={`/player/${latestBookmark.bookId}`}
            >
              Resume bookmark
            </Link>
          ) : null}
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-white/90 p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Latest moment
          </p>
          <p className="mt-2 text-lg font-semibold text-stone-950">
            {latestQuote ? "Saved quote ready" : "No saved quote yet"}
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {latestQuote
              ? `“${latestQuote.text}”`
              : "Save a quote in the player to build your own memorable moments archive."}
          </p>
          {latestQuote ? (
            <Link
              className="mt-4 inline-flex rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
              href={`/player/${latestQuote.bookId}?quoteChapter=${latestQuote.chapterIndex}&quoteProgress=${latestQuote.progressSeconds}`}
            >
              Revisit quote
            </Link>
          ) : null}
        </article>
      </div>
    </section>
  );
}
