"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  defaultTasteChangedEvent,
  listeningProfileChangedEvent,
  readLocalLibraryBook,
  readLocalListeningProfiles,
  writeDefaultListeningProfile,
} from "@/lib/library/local-library";
import { workspaceContextChangedEvent } from "@/lib/library/local-state";

type RecentTaste = {
  bookId: string;
  bookTitle: string;
  narratorName: string;
  mode: string;
};

const pinnedTasteStorageKey = "adaptive-audio-player.pinned-taste";

function readPinnedTasteBookId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(pinnedTasteStorageKey);
}

function readRecentTastes(): RecentTaste[] {
  const pinnedBookId = readPinnedTasteBookId();
  const profiles = readLocalListeningProfiles();
  const orderedProfiles = pinnedBookId
    ? [
        ...profiles.filter((profile) => profile.bookId === pinnedBookId),
        ...profiles.filter((profile) => profile.bookId !== pinnedBookId),
      ]
    : profiles;

  return orderedProfiles
    .slice(0, 4)
    .map((profile) => {
      const book = readLocalLibraryBook(profile.bookId);
      return {
        bookId: profile.bookId,
        bookTitle: book?.title ?? `Book ${profile.bookId}`,
        narratorName: profile.narratorName,
        mode: profile.mode,
      };
    });
}

export function RecentTastesCard() {
  const [recentTastes, setRecentTastes] = useState<RecentTaste[]>(() =>
    typeof window === "undefined" ? [] : readRecentTastes(),
  );
  const [feedbackBookId, setFeedbackBookId] = useState<string | null>(null);
  const [pinnedBookId, setPinnedBookId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : readPinnedTasteBookId(),
  );

  useEffect(() => {
    function refresh() {
      setRecentTastes(readRecentTastes());
      setPinnedBookId(readPinnedTasteBookId());
    }

    refresh();
    window.addEventListener(listeningProfileChangedEvent, refresh);
    window.addEventListener(defaultTasteChangedEvent, refresh);
    window.addEventListener(workspaceContextChangedEvent, refresh);

    return () => {
      window.removeEventListener(listeningProfileChangedEvent, refresh);
      window.removeEventListener(defaultTasteChangedEvent, refresh);
      window.removeEventListener(workspaceContextChangedEvent, refresh);
    };
  }, []);

  const hasTastes = recentTastes.length > 0;
  const subtitle = useMemo(() => {
    if (!hasTastes) {
      return "As you generate samples and change books, your strongest narrator/mode combinations will show up here for quick reuse.";
    }

    return "Reuse a vibe you already liked, or promote it to the default for your next import.";
  }, [hasTastes]);

  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-white shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
      <div className="border-b border-stone-200/80 bg-[linear-gradient(135deg,#fffdf7_0%,#f7f3ea_52%,#eef4ff_100%)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              Recent tastes
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-900">
              Reuse a listening vibe you already trust
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">{subtitle}</p>
          </div>
          <div className="rounded-[1.2rem] border border-stone-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-stone-500">
              Saved profiles
            </p>
            <p className="mt-2 text-base font-semibold text-stone-950">
              {recentTastes.length}
            </p>
          </div>
        </div>
      </div>
      <div className="p-6">
        {hasTastes ? (
          <div className="grid gap-3">
            {recentTastes.map((taste) => (
              <article
                key={taste.bookId}
                className="rounded-[1.4rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-xl">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
                      {taste.bookTitle}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-stone-950">
                      {taste.narratorName} in {taste.mode}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                      <span className="rounded-full bg-stone-100 px-2.5 py-1">
                        {taste.narratorName}
                      </span>
                      <span className="rounded-full bg-stone-100 px-2.5 py-1 capitalize">
                        {taste.mode}
                      </span>
                      {pinnedBookId === taste.bookId ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">
                          Pinned
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                      type="button"
                      onClick={() => {
                        if (typeof window === "undefined") {
                          return;
                        }

                        if (pinnedBookId === taste.bookId) {
                          window.localStorage.removeItem(pinnedTasteStorageKey);
                          setPinnedBookId(null);
                        } else {
                          window.localStorage.setItem(pinnedTasteStorageKey, taste.bookId);
                          setPinnedBookId(taste.bookId);
                        }
                        setRecentTastes(readRecentTastes());
                      }}
                    >
                      {pinnedBookId === taste.bookId ? "Unpin" : "Pin taste"}
                    </button>
                    <button
                      className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                      type="button"
                      onClick={() => {
                        writeDefaultListeningProfile({
                          bookId: taste.bookId,
                          narratorId: taste.narratorName.toLowerCase().replace(/\s+/g, "-"),
                          narratorName: taste.narratorName,
                          mode: taste.mode as "classic" | "ambient" | "immersive",
                        });
                        setFeedbackBookId(taste.bookId);
                        window.setTimeout(() => setFeedbackBookId(null), 1800);
                      }}
                    >
                      Make default
                    </button>
                    <Link
                      className="rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
                      href={`/books/${taste.bookId}`}
                    >
                      Open book
                    </Link>
                  </div>
                </div>
                {feedbackBookId === taste.bookId ? (
                  <p className="mt-3 text-sm text-emerald-700">
                    This taste is now your default for new imports.
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-[1.4rem] border border-dashed border-stone-300 bg-stone-50/80 p-5 text-sm leading-6 text-stone-600">
            No recent tastes yet. Generate a sample or save a book’s taste and the app will start surfacing your best combinations here.
          </div>
        )}
      </div>
    </section>
  );
}
