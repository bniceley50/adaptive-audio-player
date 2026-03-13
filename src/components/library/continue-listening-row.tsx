"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { pushClientLibrarySyncSnapshot } from "@/lib/backend/client-sync";
import type { LibrarySyncSnapshot } from "@/lib/backend/types";
import {
  clearRemovedLocalLibraryBook,
  defaultTasteChangedEvent,
  describeListeningTasteSource,
  formatRelativeUpdatedAt,
  generationOutputChangedEvent,
  libraryChangedEvent,
  listeningProfileChangedEvent,
  renameLocalLibraryBook,
  readLocalGenerationOutput,
  resolvePreferredGenerationOutput,
  readLocalLibraryBooks,
  readRemovedLocalLibraryBooks,
  readLocalSampleRequest,
  removedBooksChangedEvent,
  removeLocalLibraryBook,
  restoreRemovedLocalLibraryBook,
  resolveListeningTaste,
  sampleRequestChangedEvent,
  writeDefaultListeningProfile,
  type LocalSampleRequest,
  type LocalLibraryBook,
  type RemovedLocalLibraryBook,
} from "@/lib/library/local-library";
import {
  formatPlaybackTime,
  getPlaybackPercent,
  playbackChangedEvent,
  readPersistedPlaybackState,
  resolvePreferredPlaybackState,
} from "@/lib/playback/local-playback";

type ShelfGroupKey =
  | "active"
  | "sample-ready"
  | "taste-ready"
  | "setup-needed";

type ShelfFilter = "all" | ShelfGroupKey;

interface ShelfBookRecord {
  book: LocalLibraryBook;
  group: ShelfGroupKey;
  searchText: string;
}

function getUpdatedAtWeight(updatedAt: string | null | undefined): number {
  if (!updatedAt) {
    return 0;
  }

  const timestamp = new Date(updatedAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function mergeLibraryBooks(
  localBooks: LocalLibraryBook[],
  syncedBooks: LocalLibraryBook[],
  removedBookIds: Set<string> = new Set(),
): LocalLibraryBook[] {
  const merged = new Map<string, LocalLibraryBook>();

  for (const book of syncedBooks) {
    if (removedBookIds.has(book.bookId)) {
      continue;
    }
    merged.set(book.bookId, book);
  }

  for (const localBook of localBooks) {
    if (removedBookIds.has(localBook.bookId)) {
      continue;
    }
    const existing = merged.get(localBook.bookId);

    if (!existing) {
      merged.set(localBook.bookId, localBook);
      continue;
    }

    merged.set(
      localBook.bookId,
      getUpdatedAtWeight(localBook.updatedAt) >= getUpdatedAtWeight(existing.updatedAt)
        ? localBook
        : existing,
    );
  }

  return [...merged.values()];
}

function getBookCoverTheme(title: string) {
  const themes = [
    "from-amber-200 via-orange-100 to-stone-50",
    "from-sky-200 via-cyan-100 to-white",
    "from-rose-200 via-fuchsia-100 to-white",
    "from-emerald-200 via-teal-100 to-white",
    "from-violet-200 via-indigo-100 to-white",
  ];
  const index =
    title.split("").reduce((sum, character) => sum + character.charCodeAt(0), 0) %
    themes.length;
  return themes[index];
}

function getBookInitials(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getShelfCoverTheme(book: LocalLibraryBook) {
  return book.coverTheme ?? getBookCoverTheme(book.title);
}

function getShelfCoverGlyph(book: LocalLibraryBook) {
  return book.coverGlyph ?? getBookInitials(book.title);
}

const shelfGroups: Array<{
  key: ShelfGroupKey;
  heading: string;
  description: string;
}> = [
  {
    key: "active",
    heading: "Continue listening",
    description: "Books with listening progress you can resume immediately.",
  },
  {
    key: "sample-ready",
    heading: "Resume sample",
    description: "Books with a generated sample and no listening history yet.",
  },
  {
    key: "taste-ready",
    heading: "Start with taste",
    description: "Books that already know how they should sound, but have not generated a sample yet.",
  },
  {
    key: "setup-needed",
    heading: "Needs setup",
    description: "Imported books that still need a narrator and listening mode.",
  },
];

interface ContinueListeningRowProps {
  initialSnapshot?: LibrarySyncSnapshot | null;
}

export function ContinueListeningRow({
  initialSnapshot = null,
}: ContinueListeningRowProps) {
  const [libraryBooks, setLibraryBooks] = useState<LocalLibraryBook[]>(
    () => mergeLibraryBooks([], initialSnapshot?.libraryBooks ?? []),
  );
  const [removedBooks, setRemovedBooks] = useState<RemovedLocalLibraryBook[]>([]);
  const [sampleRequest, setSampleRequest] = useState<LocalSampleRequest | null>(null);
  const [expandedBookId, setExpandedBookId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ShelfFilter>("all");
  const [search, setSearch] = useState("");
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [deleteConfirmBookId, setDeleteConfirmBookId] = useState<string | null>(null);

  useEffect(() => {
    function refreshLibrary() {
      const localBooks = readLocalLibraryBooks();
      const nextRemovedBooks = readRemovedLocalLibraryBooks();
      const removedBookIds = new Set(
        nextRemovedBooks.map((removedBook) => removedBook.book.bookId),
      );
      setLibraryBooks(
        mergeLibraryBooks(
          localBooks,
          initialSnapshot?.libraryBooks ?? [],
          removedBookIds,
        ),
      );
      setRemovedBooks(nextRemovedBooks);
      setSampleRequest(readLocalSampleRequest() ?? initialSnapshot?.sampleRequest ?? null);
    }

    refreshLibrary();

    window.addEventListener(libraryChangedEvent, refreshLibrary);
    window.addEventListener(listeningProfileChangedEvent, refreshLibrary);
    window.addEventListener(defaultTasteChangedEvent, refreshLibrary);
    window.addEventListener(sampleRequestChangedEvent, refreshLibrary);
    window.addEventListener(generationOutputChangedEvent, refreshLibrary);
    window.addEventListener(playbackChangedEvent, refreshLibrary);
    window.addEventListener(removedBooksChangedEvent, refreshLibrary);
    window.addEventListener("storage", refreshLibrary);

    return () => {
      window.removeEventListener(libraryChangedEvent, refreshLibrary);
      window.removeEventListener(listeningProfileChangedEvent, refreshLibrary);
      window.removeEventListener(defaultTasteChangedEvent, refreshLibrary);
      window.removeEventListener(sampleRequestChangedEvent, refreshLibrary);
      window.removeEventListener(generationOutputChangedEvent, refreshLibrary);
      window.removeEventListener(playbackChangedEvent, refreshLibrary);
      window.removeEventListener(removedBooksChangedEvent, refreshLibrary);
      window.removeEventListener("storage", refreshLibrary);
    };
  }, [initialSnapshot]);

  const initialProfilesByBook = useMemo(
    () =>
      new Map(
        (initialSnapshot?.listeningProfiles ?? []).map((profile) => [
          profile.bookId,
          profile,
        ]),
      ),
    [initialSnapshot],
  );
  const initialPlaybackStatesByBook = useMemo(
    () =>
      new Map(
        (initialSnapshot?.playbackStates ?? []).map((playback) => [
          playback.bookId,
          playback.state,
        ]),
      ),
    [initialSnapshot],
  );
  const initialGenerationOutputsByKey = useMemo(
    () =>
      new Map(
        (initialSnapshot?.generationOutputs ?? []).map((output) => [
          `${output.bookId}:${output.kind}`,
          output,
        ]),
      ),
    [initialSnapshot],
  );
  const initialDefaultProfile = initialSnapshot?.defaultListeningProfile ?? null;
  const initialRecentProfile = initialSnapshot?.listeningProfiles?.[0] ?? null;

  const shelfBooks = useMemo(() => {
    return libraryBooks
      .map((book) => {
        const playbackState = resolvePreferredPlaybackState(
          readPersistedPlaybackState(book.bookId),
          initialPlaybackStatesByBook.get(book.bookId) ?? null,
        );
        const localResolvedTaste = resolveListeningTaste(book.bookId);
        const resolvedTaste =
          localResolvedTaste.source !== "none"
            ? localResolvedTaste
            : initialProfilesByBook.get(book.bookId)
              ? {
                  profile: initialProfilesByBook.get(book.bookId) ?? null,
                  source: "saved" as const,
                }
              : initialDefaultProfile
                ? {
                    profile: initialDefaultProfile,
                    source: "default" as const,
                  }
                : initialRecentProfile
                  ? {
                      profile: initialRecentProfile,
                      source: "recent" as const,
                    }
                  : localResolvedTaste;
        const sampleOutput = resolvePreferredGenerationOutput(
          readLocalGenerationOutput(book.bookId, "sample-generation"),
          initialGenerationOutputsByKey.get(`${book.bookId}:sample-generation`) ??
            null,
        );
        const fullBookOutput = resolvePreferredGenerationOutput(
          readLocalGenerationOutput(book.bookId, "full-book-generation"),
          initialGenerationOutputsByKey.get(`${book.bookId}:full-book-generation`) ??
            null,
        );
        const hasSample =
          !!sampleOutput ||
          ((sampleRequest ?? initialSnapshot?.sampleRequest ?? null)?.bookId === book.bookId &&
            (resolvedTaste.source !== "none" || !!resolvedTaste.profile));
        const group: ShelfGroupKey = playbackState
          ? "active"
          : hasSample
            ? "sample-ready"
            : resolvedTaste.source === "none"
              ? "setup-needed"
              : "taste-ready";

        return {
          book,
          group,
          searchText:
            `${book.title} ${book.genreLabel ?? ""} ${resolvedTaste.profile?.narratorName ?? ""} ${resolvedTaste.profile?.mode ?? ""} ${sampleOutput?.provider ?? ""} ${fullBookOutput ? "full book ready" : ""}`.toLowerCase(),
        };
      })
      .sort((left, right) => {
        const leftPlayback = resolvePreferredPlaybackState(
          readPersistedPlaybackState(left.book.bookId),
          initialPlaybackStatesByBook.get(left.book.bookId) ?? null,
        );
        const rightPlayback = resolvePreferredPlaybackState(
          readPersistedPlaybackState(right.book.bookId),
          initialPlaybackStatesByBook.get(right.book.bookId) ?? null,
        );
        const leftActivity =
          leftPlayback?.updatedAt ?? left.book.updatedAt ?? new Date(0).toISOString();
        const rightActivity =
          rightPlayback?.updatedAt ?? right.book.updatedAt ?? new Date(0).toISOString();
        return rightActivity.localeCompare(leftActivity);
      });
  }, [
    initialDefaultProfile,
    initialGenerationOutputsByKey,
    initialPlaybackStatesByBook,
    initialProfilesByBook,
    initialRecentProfile,
    initialSnapshot?.sampleRequest,
    libraryBooks,
    sampleRequest,
  ]);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredShelfBooks = shelfBooks.filter((entry) => {
    const matchesFilter = activeFilter === "all" || entry.group === activeFilter;
    const matchesSearch =
      normalizedSearch.length === 0 || entry.searchText.includes(normalizedSearch);
    return matchesFilter && matchesSearch;
  });

  const groupedShelfBooks = filteredShelfBooks.reduce<Record<ShelfGroupKey, ShelfBookRecord[]>>(
    (groups, entry) => {
      groups[entry.group].push(entry);
      return groups;
    },
    {
      active: [],
      "sample-ready": [],
      "taste-ready": [],
      "setup-needed": [],
    },
  );

  const totalStats = {
    all: shelfBooks.length,
    active: shelfBooks.filter((entry) => entry.group === "active").length,
    "sample-ready": shelfBooks.filter((entry) => entry.group === "sample-ready").length,
    "taste-ready": shelfBooks.filter((entry) => entry.group === "taste-ready").length,
    "setup-needed": shelfBooks.filter((entry) => entry.group === "setup-needed").length,
  };

  function startRenaming(book: LocalLibraryBook) {
    setEditingBookId(book.bookId);
    setTitleDraft(book.title);
    setDeleteConfirmBookId(null);
  }

  function cancelRenaming() {
    setEditingBookId(null);
    setTitleDraft("");
  }

  function saveRename(book: LocalLibraryBook) {
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setTitleDraft(book.title);
      return;
    }

    renameLocalLibraryBook(book.bookId, nextTitle);
    setEditingBookId(null);
    setTitleDraft("");
    void pushClientLibrarySyncSnapshot().catch(() => null);
  }

  function confirmDelete(bookId: string) {
    setDeleteConfirmBookId(bookId);
    if (editingBookId === bookId) {
      cancelRenaming();
    }
  }

  function cancelDelete() {
    setDeleteConfirmBookId(null);
  }

  function deleteBook(bookId: string) {
    removeLocalLibraryBook(bookId);
    setDeleteConfirmBookId((current) => (current === bookId ? null : current));
    setExpandedBookId((current) => (current === bookId ? null : current));
    setEditingBookId((current) => (current === bookId ? null : current));
    setTitleDraft("");
    void pushClientLibrarySyncSnapshot().catch(() => null);
  }

  function restoreBook(bookId: string) {
    restoreRemovedLocalLibraryBook(bookId);
    void pushClientLibrarySyncSnapshot().catch(() => null);
  }

  function dismissRemovedBook(bookId: string) {
    clearRemovedLocalLibraryBook(bookId);
    void pushClientLibrarySyncSnapshot().catch(() => null);
  }

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 bg-[linear-gradient(135deg,#f8f3e7_0%,#fffdf8_48%,#eef4ff_100%)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              Personal library
            </p>
            <h2 className="mt-2 text-lg font-semibold text-stone-900">
              Continue listening
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Your shelf is organized by listening state, so the next useful action
              is always visible: resume, review the sample, start with taste, or
              finish setup.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
            <span className="rounded-full border border-white/80 bg-white/80 px-3 py-2 backdrop-blur">
              Books: {totalStats.all}
            </span>
            <span className="rounded-full border border-white/80 bg-white/80 px-3 py-2 backdrop-blur">
              Active: {totalStats.active}
            </span>
            <span className="rounded-full border border-white/80 bg-white/80 px-3 py-2 backdrop-blur">
              Samples: {totalStats["sample-ready"]}
            </span>
            <span className="rounded-full border border-white/80 bg-white/80 px-3 py-2 backdrop-blur">
              Setup: {totalStats["setup-needed"]}
            </span>
          </div>
        </div>
      </div>

      <div className="p-6">
      <div className="flex flex-wrap gap-3">
        {[
          ["all", "All books"],
          ["active", "Continue listening"],
          ["sample-ready", "Resume sample"],
          ["taste-ready", "Start with taste"],
          ["setup-needed", "Needs setup"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              activeFilter === value
                ? "bg-stone-950 text-white shadow-sm"
                : "border border-stone-300 bg-white text-stone-700 shadow-sm transition hover:border-stone-400 hover:text-stone-950"
            }`}
            type="button"
            onClick={() => setActiveFilter(value as ShelfFilter)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <label className="block text-sm font-medium text-stone-900" htmlFor="library-search">
          Search your shelf
        </label>
        <input
          id="library-search"
          className="mt-2 w-full rounded-[1.25rem] border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 outline-none transition focus:border-stone-400"
          placeholder="Search by title, narrator, or mode"
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {removedBooks.length > 0 ? (
        <section className="mt-6 rounded-[1.5rem] border border-amber-200 bg-[linear-gradient(135deg,#fff7d8_0%,#fffdf7_100%)] p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-amber-950">Recently removed</h3>
              <p className="mt-1 text-sm text-amber-900">
                Deleted books can be restored from here before you dismiss them.
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-amber-700">
              {removedBooks.length}
            </span>
          </div>
          <div className="mt-4 grid gap-3">
            {removedBooks.map((removedBook) => (
              <div
                key={removedBook.book.bookId}
                className="rounded-2xl border border-amber-200 bg-white px-4 py-4 text-sm text-stone-700 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-stone-950">{removedBook.book.title}</p>
                    <p className="mt-1 text-stone-600">
                      Removed {formatRelativeUpdatedAt(removedBook.removedAt).replace("Updated ", "").toLowerCase()}.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      className="rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white"
                      type="button"
                      onClick={() => restoreBook(removedBook.book.bookId)}
                    >
                      Restore book
                    </button>
                    <button
                      className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700"
                      type="button"
                      onClick={() => dismissRemovedBook(removedBook.book.bookId)}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {libraryBooks.length > 0 ? (
        <div className="mt-6 space-y-6">
          {shelfGroups.map(({ key, heading, description }) => {
            const groupBooks = groupedShelfBooks[key];

            if (groupBooks.length === 0) {
              return null;
            }

            return (
              <section key={key} className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-stone-900">{heading}</h3>
                    <p className="mt-1 text-sm text-stone-600">{description}</p>
                  </div>
                  <span className="rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-500 shadow-sm">
                    {groupBooks.length}
                  </span>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {groupBooks.map(({ book }, index) => {
                    const playbackState = resolvePreferredPlaybackState(
                      readPersistedPlaybackState(book.bookId),
                      initialPlaybackStatesByBook.get(book.bookId) ?? null,
                    );
                    const sampleOutput =
                      readLocalGenerationOutput(book.bookId, "sample-generation") ??
                      initialGenerationOutputsByKey.get(
                        `${book.bookId}:sample-generation`,
                      ) ??
                      null;
                    const fullBookOutput =
                      readLocalGenerationOutput(book.bookId, "full-book-generation") ??
                      initialGenerationOutputsByKey.get(
                        `${book.bookId}:full-book-generation`,
                      ) ??
                      null;
                    const currentChapterNumber = Math.min(
                      (playbackState?.currentChapterIndex ?? 0) + 1,
                      Math.max(book.chapterCount, 1),
                    );
                    const progressLabel = playbackState
                      ? `${formatPlaybackTime(playbackState.progressSeconds)} listened`
                      : "Not started yet";
                    const progressPercent = playbackState
                      ? `${getPlaybackPercent(playbackState.progressSeconds)}% through this chapter`
                      : "Ready to start";
                    const bookmarkCount = playbackState?.bookmarks?.length ?? 0;
                    const localResolvedTaste = resolveListeningTaste(book.bookId);
                    const resolvedTaste =
                      localResolvedTaste.source !== "none"
                        ? localResolvedTaste
                        : initialProfilesByBook.get(book.bookId)
                          ? {
                              profile:
                                initialProfilesByBook.get(book.bookId) ?? null,
                              source: "saved" as const,
                            }
                          : initialDefaultProfile
                            ? {
                                profile: initialDefaultProfile,
                                source: "default" as const,
                              }
                            : initialRecentProfile
                              ? {
                                  profile: initialRecentProfile,
                                  source: "recent" as const,
                                }
                              : localResolvedTaste;
                    const narratorLabel =
                      resolvedTaste.profile?.narratorName ??
                      sampleOutput?.narratorId ??
                      ((sampleRequest ?? initialSnapshot?.sampleRequest ?? null)?.bookId ===
                      book.bookId
                        ? (sampleRequest ?? initialSnapshot?.sampleRequest ?? null)
                            ?.narratorId
                        : "Not chosen yet");
                    const modeLabel =
                      resolvedTaste.profile?.mode ??
                      sampleOutput?.mode ??
                      ((sampleRequest ?? initialSnapshot?.sampleRequest ?? null)?.bookId ===
                      book.bookId
                        ? (sampleRequest ?? initialSnapshot?.sampleRequest ?? null)?.mode
                        : "setup pending");
                    const sampleResumeProfile =
                      (resolvedTaste.profile && resolvedTaste.source === "saved"
                        ? resolvedTaste.profile
                        : null) ??
                      (sampleOutput?.narratorId && sampleOutput.mode
                        ? {
                            narratorId: sampleOutput.narratorId,
                            mode: sampleOutput.mode,
                          }
                        : null) ??
                      ((sampleRequest ?? initialSnapshot?.sampleRequest ?? null)?.bookId ===
                      book.bookId
                        ? {
                            narratorId:
                              (sampleRequest ?? initialSnapshot?.sampleRequest ?? null)
                                ?.narratorId ?? "",
                            mode:
                              (sampleRequest ?? initialSnapshot?.sampleRequest ?? null)
                                ?.mode ?? "ambient",
                          }
                        : null);
                    const resumeArtifact =
                      playbackState?.playbackArtifactKind === "sample-generation" &&
                      sampleOutput
                        ? "sample"
                        : playbackState?.playbackArtifactKind ===
                              "full-book-generation" && fullBookOutput
                          ? "full"
                          : fullBookOutput && !playbackState
                            ? "full"
                            : sampleOutput
                              ? "sample"
                              : null;
                    const resumeHref =
                      sampleResumeProfile
                        ? `/player/${book.bookId}?narrator=${sampleResumeProfile.narratorId}&mode=${sampleResumeProfile.mode}${resumeArtifact ? `&artifact=${resumeArtifact}` : ""}`
                        : resumeArtifact
                          ? `/player/${book.bookId}?artifact=${resumeArtifact}`
                        : `/books/${book.bookId}`;
                    const ctaLabel =
                      resumeArtifact === "full" && !playbackState
                        ? "Listen full book"
                        : sampleResumeProfile && playbackState
                        ? "Continue listening"
                        : sampleOutput
                          ? "Resume sample"
                        : resolvedTaste.source === "default"
                            ? "Start with default taste"
                            : resolvedTaste.source === "recent"
                              ? "Start with latest taste"
                              : "Continue setup";
                    const defaultableProfile = resolvedTaste.profile;
                    const tasteSource = describeListeningTasteSource(resolvedTaste);
                    const secondaryHref =
                      resolvedTaste.source === "saved"
                        ? `/books/${book.bookId}`
                        : resolvedTaste.source === "none"
                          ? `/books/${book.bookId}`
                          : `/import`;
                    const resumeArtifactLabel =
                      resumeArtifact === "full"
                        ? "Resumes full-book audio"
                        : resumeArtifact === "sample"
                          ? "Resumes sample audio"
                          : null;
                    const statusLabel =
                      key === "active"
                        ? "In progress"
                        : key === "sample-ready"
                          ? "Sample is ready"
                          : key === "taste-ready"
                            ? "Taste chosen"
                            : "Needs setup";

                    return (
                      <div
                        key={book.bookId}
                        data-testid={`shelf-book-${book.bookId}`}
                        className="overflow-hidden rounded-[1.5rem] border border-stone-200 bg-[linear-gradient(180deg,#ffffff_0%,#faf8f4_100%)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <div className="flex items-start gap-4">
                          <div
                            className={`flex h-28 w-24 shrink-0 flex-col justify-between overflow-hidden rounded-[1.35rem] border border-stone-200 bg-gradient-to-br ${getShelfCoverTheme(book)} p-4 shadow-sm`}
                          >
                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-600">
                              {book.coverLabel ?? (index === 0 ? "Featured" : "Library")}
                            </p>
                            <div>
                              <p className="text-2xl font-semibold tracking-tight text-stone-950">
                                {getShelfCoverGlyph(book)}
                              </p>
                              <p className="mt-1 text-[0.68rem] uppercase tracking-[0.18em] text-stone-500">
                                {modeLabel}
                              </p>
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm uppercase tracking-[0.22em] text-stone-500">
                              {index === 0 ? "Most recent in this section" : "Library import"}
                            </p>
                            {editingBookId === book.bookId ? (
                              <div className="mt-3 space-y-3">
                                <label
                                  className="block text-sm font-medium text-stone-900"
                                  htmlFor={`rename-${book.bookId}`}
                                >
                                  Rename book
                                </label>
                                <input
                                  id={`rename-${book.bookId}`}
                                  className="w-full rounded-[1.25rem] border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 outline-none transition focus:border-stone-400"
                                  type="text"
                                  value={titleDraft}
                                  onChange={(event) => setTitleDraft(event.target.value)}
                                />
                                <div className="flex flex-wrap gap-3">
                                  <button
                                    className="rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white"
                                    type="button"
                                    onClick={() => saveRename(book)}
                                  >
                                    Save title
                                  </button>
                                  <button
                                    className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700"
                                    type="button"
                                    onClick={cancelRenaming}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <h3 className="mt-3 text-2xl font-semibold text-stone-950">
                                {book.title}
                              </h3>
                            )}
                            <p className="mt-2 text-sm leading-6 text-stone-600">
                              {book.chapterCount} chapter
                              {book.chapterCount === 1 ? "" : "s"} ready in your private
                              library.
                            </p>
                          </div>
                        </div>
                        <p className="mt-2 text-sm text-stone-500">
                          {formatRelativeUpdatedAt(book.updatedAt)}
                        </p>
                        <p className="mt-2 text-sm font-medium text-stone-800">
                          {statusLabel}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                          {book.genreLabel ? (
                            <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-fuchsia-800">
                              {book.genreLabel}
                            </span>
                          ) : null}
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                            {tasteSource.badge}
                          </span>
                          <span className="rounded-full border border-stone-200 bg-stone-100 px-3 py-2">
                            Narrator: {narratorLabel}
                          </span>
                          <span className="rounded-full border border-stone-200 bg-stone-100 px-3 py-2 capitalize">
                            Mode: {modeLabel}
                          </span>
                          {sampleOutput ? (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
                              Sample ready
                            </span>
                          ) : null}
                          {fullBookOutput ? (
                            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-sky-800">
                              Full book ready
                            </span>
                          ) : null}
                          {resumeArtifactLabel ? (
                            <span className="rounded-full border border-stone-200 bg-white px-3 py-2 text-stone-700">
                              {resumeArtifactLabel}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-700">
                          <p className="font-medium text-stone-900">
                            Chapter {currentChapterNumber}
                          </p>
                          <p className="mt-1">{progressLabel}</p>
                          <p className="mt-1 text-stone-500">{progressPercent}</p>
                          <p className="mt-1 text-stone-500">
                            Bookmarks: {bookmarkCount}
                          </p>
                        </div>
                        <div className="mt-4 rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 px-4 py-4 text-sm text-stone-700">
                          <p className="font-medium text-stone-900">
                            Why this taste: {tasteSource.summary}
                          </p>
                          <p className="mt-1">{tasteSource.actionHint}</p>
                          <button
                            className="mt-3 text-sm font-medium text-stone-900 underline underline-offset-4"
                            type="button"
                            onClick={() =>
                              setExpandedBookId(
                                expandedBookId === book.bookId ? null : book.bookId,
                              )
                            }
                          >
                            {expandedBookId === book.bookId
                              ? "Hide taste details"
                              : "Show taste details"}
                          </button>
                          {expandedBookId === book.bookId ? (
                            <p className="mt-3 text-stone-600">{tasteSource.detail}</p>
                          ) : null}
                        </div>
                        <div className="mt-5 flex flex-wrap gap-3">
                          <Link
                            className="rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-stone-800"
                            href={resumeHref}
                          >
                            {ctaLabel}
                          </Link>
                          <Link
                            className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:text-stone-950"
                            href={secondaryHref}
                          >
                            {resolvedTaste.source === "saved"
                              ? "Review this taste"
                              : resolvedTaste.source === "none"
                                ? "Choose a taste"
                                : "Manage default taste"}
                          </Link>
                          {defaultableProfile ? (
                            <button
                              className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:text-stone-950"
                              type="button"
                              onClick={() => writeDefaultListeningProfile(defaultableProfile)}
                            >
                              Make this the default
                            </button>
                          ) : null}
                          {fullBookOutput?.assetPath ? (
                            <Link
                              className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:text-stone-950"
                              href={`/api/audio/generated/${book.bookId}?kind=full-book-generation`}
                              target="_blank"
                            >
                              Download full book
                            </Link>
                          ) : null}
                          {editingBookId === book.bookId ? null : (
                            <button
                              className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:text-stone-950"
                              type="button"
                              onClick={() => startRenaming(book)}
                            >
                              Rename
                            </button>
                          )}
                          {deleteConfirmBookId === book.bookId ? (
                            <>
                              <button
                                className="rounded-full bg-rose-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700"
                                type="button"
                                onClick={() => deleteBook(book.bookId)}
                              >
                                Confirm delete
                              </button>
                              <button
                                className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:text-stone-950"
                                type="button"
                                onClick={cancelDelete}
                              >
                                Keep book
                              </button>
                            </>
                          ) : (
                            <button
                              className="rounded-full border border-rose-300 bg-white px-5 py-3 text-sm font-medium text-rose-700 shadow-sm transition hover:border-rose-400 hover:text-rose-800"
                              type="button"
                              onClick={() => confirmDelete(book.bookId)}
                            >
                              Delete book
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {filteredShelfBooks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-5 text-sm text-stone-600 shadow-sm">
              No books match this filter yet. Try a different shelf state or clear the
              search.
            </div>
          ) : null}

          <Link
            className="inline-flex rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:text-stone-950"
            href="/import"
          >
            Import another book
          </Link>
        </div>
      ) : (
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Import a book to create your first continue-listening card.
        </p>
      )}
      </div>
    </section>
  );
}
