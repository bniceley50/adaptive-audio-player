"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  getBookCoverTheme,
  getBookInitials,
  getUpdatedAtWeight,
} from "@/features/reader/shared-support";
import {
  BooksApiError,
  deleteBook as deletePersistedBook,
  listBooks,
  type LibraryBookActivity,
  type LibraryBookSummary,
  type LibraryGenerationKind,
} from "@/lib/client/books-api";
import {
  readLocalLibraryBooks,
  removeLocalLibraryBook,
  type LocalLibraryBook,
} from "@/lib/library/local-library";

export type LibraryBookStateKind =
  | "needs-setup"
  | "sample-generating"
  | "sample-ready"
  | "book-generating"
  | "ready"
  | "failed";

export interface ResolvedLibraryBookState {
  actionKind: "delete" | "link";
  actionLabel: string;
  detail: string;
  href: string | null;
  kind: LibraryBookStateKind;
  label: string;
  resumeLabel: string | null;
}

interface ResolveLibraryBookStateInput {
  activity: LibraryBookActivity;
  bookId: string;
}

interface ShelfBook extends LibraryBookSummary {
  coverGlyph?: string;
  coverTheme?: string;
}

interface ContinueListeningRowProps {
  hideWhenEmpty?: boolean;
}

function formatResumeTime(seconds: number) {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3_600);
  const minutes = Math.floor((wholeSeconds % 3_600) / 60);
  const remainingSeconds = wholeSeconds % 60;

  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
        .toString()
        .padStart(2, "0")}`
    : `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function getCurrentOutput(
  activity: LibraryBookActivity,
  kind: LibraryGenerationKind,
) {
  return activity.outputs.find(
    (output) =>
      output.kind === kind &&
      output.isCurrent &&
      !!output.artifactId?.trim() &&
      !!output.jobId?.trim() &&
      output.artifactUrl.startsWith("/api/audio/"),
  );
}

function getResumeLabel(
  activity: LibraryBookActivity,
  artifactId: string | null,
) {
  const progress = activity.progress;
  if (
    !progress ||
    !artifactId ||
    progress.artifactId !== artifactId ||
    progress.positionSeconds <= 0
  ) {
    return null;
  }

  const chapter =
    progress.chapterIndex === null ? "" : ` · Chapter ${progress.chapterIndex + 1}`;
  return `Resume at ${formatResumeTime(progress.positionSeconds)}${chapter}`;
}

function getLatestJob(activity: LibraryBookActivity) {
  return [...activity.jobs].sort(
    (left, right) =>
      getUpdatedAtWeight(right.createdAt) - getUpdatedAtWeight(left.createdAt),
  )[0];
}

export function resolveLibraryBookState({
  activity,
  bookId,
}: ResolveLibraryBookStateInput): ResolvedLibraryBookState {
  const fullOutput = getCurrentOutput(activity, "full-book-generation");
  if (fullOutput) {
    const resumeLabel = getResumeLabel(activity, fullOutput.artifactId);
    return {
      actionKind: "link",
      actionLabel: resumeLabel ? "Continue listening" : "Listen to audiobook",
      detail: "The complete audiobook is ready to play.",
      href: `/player/${bookId}?artifact=full`,
      kind: "ready",
      label: "Audiobook ready",
      resumeLabel,
    };
  }

  const hasActiveFullJob = activity.jobs.some(
    (job) =>
      job.kind === "full-book-generation" &&
      (job.status === "queued" || job.status === "running"),
  );
  if (hasActiveFullJob) {
    return {
      actionKind: "link",
      actionLabel: "View audiobook progress",
      detail: "The complete audiobook is being created.",
      href: `/books/${bookId}`,
      kind: "book-generating",
      label: "Audiobook is being created",
      resumeLabel: null,
    };
  }

  const hasActiveSampleJob = activity.jobs.some(
    (job) =>
      job.kind === "sample-generation" &&
      (job.status === "queued" || job.status === "running"),
  );
  if (hasActiveSampleJob) {
    return {
      actionKind: "link",
      actionLabel: "View sample progress",
      detail: "A voice sample is being created.",
      href: `/books/${bookId}`,
      kind: "sample-generating",
      label: "Sample is being created",
      resumeLabel: null,
    };
  }

  const latestJob = getLatestJob(activity);
  const latestCompletedWithoutOutput =
    latestJob?.status === "completed" &&
    !getCurrentOutput(activity, latestJob.kind);
  if (
    latestJob?.status === "failed" ||
    latestJob?.status === "cancelled" ||
    latestCompletedWithoutOutput
  ) {
    return {
      actionKind: "link",
      actionLabel: "Review and retry",
      detail: "The last audio attempt did not produce playable audio.",
      href: `/books/${bookId}`,
      kind: "failed",
      label: "Audio needs attention",
      resumeLabel: null,
    };
  }

  const sampleOutput = getCurrentOutput(activity, "sample-generation");
  if (sampleOutput) {
    const resumeLabel = getResumeLabel(activity, sampleOutput.artifactId);
    return {
      actionKind: "link",
      actionLabel: resumeLabel ? "Continue sample" : "Listen to sample",
      detail: "The selected voice sample is ready to play.",
      href: `/player/${bookId}?artifact=sample`,
      kind: "sample-ready",
      label: "Sample ready",
      resumeLabel,
    };
  }

  return {
    actionKind: "link",
    actionLabel: "Choose a voice",
    detail: "Choose a voice and create a short sample.",
    href: `/books/${bookId}`,
    kind: "needs-setup",
    label: "Voice setup needed",
    resumeLabel: null,
  };
}

function buildShelfBooks(
  persistedBooks: LibraryBookSummary[],
  localBooks: LocalLibraryBook[],
) {
  const localById = new Map(localBooks.map((book) => [book.bookId, book]));
  const merged: ShelfBook[] = persistedBooks.map((book) => {
    const local = localById.get(book.bookId);
    return {
      ...book,
      coverGlyph: local?.coverGlyph,
      coverTheme: local?.coverTheme,
    };
  });

  return merged.sort((left, right) => {
    const leftUpdatedAt = left.activity.progress?.updatedAt ?? left.updatedAt;
    const rightUpdatedAt = right.activity.progress?.updatedAt ?? right.updatedAt;
    return getUpdatedAtWeight(rightUpdatedAt) - getUpdatedAtWeight(leftUpdatedAt);
  });
}

export function ContinueListeningRow({
  hideWhenEmpty = false,
}: ContinueListeningRowProps) {
  const [books, setBooks] = useState<ShelfBook[] | null>(null);
  const [confirmingBookId, setConfirmingBookId] = useState<string | null>(null);
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    const abortController = new AbortController();

    void listBooks({ signal: abortController.signal })
      .then((persistedBooks) =>
        buildShelfBooks(persistedBooks, readLocalLibraryBooks()),
      )
      .then((nextBooks) => {
        if (!abortController.signal.aborted) {
          setBooks(nextBooks);
          setLibraryError(null);
        }
      })
      .catch((error: unknown) => {
        if (!abortController.signal.aborted) {
          setBooks([]);
          setLibraryError(
            error instanceof BooksApiError
              ? error.message
              : "The library could not be loaded. Reload and try again.",
          );
        }
      });

    return () => abortController.abort();
  }, [loadAttempt]);

  async function handleDelete(bookId: string) {
    setDeletingBookId(bookId);
    setLibraryError(null);

    try {
      await deletePersistedBook(bookId);
      removeLocalLibraryBook(bookId);
      setBooks((current) =>
        current?.filter((book) => book.bookId !== bookId) ?? [],
      );
      setConfirmingBookId(null);
    } catch (error) {
      setLibraryError(
        error instanceof BooksApiError
          ? error.message
          : "This book could not be deleted safely. Try again.",
      );
    } finally {
      setDeletingBookId(null);
    }
  }

  if (books === null) {
    return (
      <section
        aria-busy="true"
        className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm"
      >
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
          Personal library
        </p>
        <h2 className="mt-2 text-lg font-semibold text-stone-900">
          Loading your library
        </h2>
      </section>
    );
  }

  if (hideWhenEmpty && books.length === 0 && !libraryError) {
    return null;
  }

  return (
    <section aria-labelledby="library-heading" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
            Personal library
          </p>
          <h2 id="library-heading" className="mt-2 text-2xl font-semibold text-stone-950">
            Books: {books.length}
          </h2>
        </div>
        {books.length > 0 ? (
          <Link
            className="text-sm font-semibold text-amber-800 underline decoration-amber-300 underline-offset-4"
            href="/import"
          >
            Add another book
          </Link>
        ) : null}
      </div>

      {libraryError ? (
        <div
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          role="alert"
        >
          <p>{libraryError}</p>
          <button
            className="mt-3 font-semibold underline underline-offset-4"
            onClick={() => {
              setBooks(null);
              setLoadAttempt((attempt) => attempt + 1);
            }}
            type="button"
          >
            Try loading again
          </button>
        </div>
      ) : null}

      {books.length === 0 ? (
        <div className="rounded-[1.75rem] border border-dashed border-stone-300 bg-white p-8 text-center shadow-sm">
          <h3 className="text-lg font-semibold text-stone-950">Add your first book</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600">
            Import a text file, a DRM-free EPUB, or pasted text to choose a voice and hear a sample.
          </p>
          <Link
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-stone-950 px-5 py-2.5 text-sm font-semibold text-white"
            href="/import"
          >
            Add your first book
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4" aria-label="Your books">
          {books.map((book) => {
            const state = resolveLibraryBookState({
              activity: book.activity,
              bookId: book.bookId,
            });
            const isConfirming = confirmingBookId === book.bookId;
            const isDeleting = deletingBookId === book.bookId;
            const primaryHref = state.href ?? `/books/${book.bookId}`;

            return (
              <li
                className="rounded-[1.5rem] border border-stone-200 bg-white p-4 shadow-sm sm:p-5"
                data-testid={`shelf-book-${book.bookId}`}
                key={book.bookId}
              >
                <article className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <Link
                    aria-label={`Open ${book.title}`}
                    className="group flex min-w-0 flex-1 items-center gap-4 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-4"
                    href={primaryHref}
                  >
                    <div
                      aria-hidden="true"
                      className={`flex h-24 w-20 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xl font-bold text-stone-800 ${
                        book.coverTheme ?? getBookCoverTheme(book.title)
                      }`}
                    >
                      {book.coverGlyph ?? getBookInitials(book.title)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-lg font-semibold text-stone-950 transition group-hover:text-amber-800 group-hover:underline group-hover:underline-offset-4">
                        {book.title}
                      </h3>
                      <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-stone-500">
                        {book.chapterCount}{" "}
                        {book.chapterCount === 1 ? "chapter" : "chapters"}
                      </p>
                      <p className="mt-3 font-semibold text-stone-900">
                        {state.label}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-stone-600">
                        {state.detail}
                      </p>
                      {state.resumeLabel ? (
                        <p className="mt-2 text-sm font-medium text-amber-800">
                          {state.resumeLabel}
                        </p>
                      ) : null}
                    </div>
                  </Link>

                  <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-52">
                    {isConfirming ? (
                      <>
                        <button
                          className="min-h-11 rounded-full bg-red-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                          disabled={isDeleting}
                          onClick={() => void handleDelete(book.bookId)}
                          type="button"
                        >
                          {isDeleting ? "Removing…" : "Confirm removal"}
                        </button>
                        <button
                          className="min-h-11 rounded-full border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700"
                          disabled={isDeleting}
                          onClick={() => setConfirmingBookId(null)}
                          type="button"
                        >
                          Keep book
                        </button>
                      </>
                    ) : state.actionKind === "link" && state.href ? (
                      <Link
                        className="inline-flex min-h-11 items-center justify-center rounded-full bg-stone-950 px-4 py-2.5 text-center text-sm font-semibold text-white"
                        href={state.href}
                      >
                        {state.actionLabel}
                      </Link>
                    ) : (
                      <button
                        className="min-h-11 rounded-full bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white"
                        onClick={() => setConfirmingBookId(book.bookId)}
                        type="button"
                      >
                        {state.actionLabel}
                      </button>
                    )}

                    {!isConfirming && state.actionKind !== "delete" ? (
                      <details className="text-center text-sm text-stone-600">
                        <summary className="cursor-pointer py-2 font-medium">Book options</summary>
                        <button
                          className="min-h-10 px-3 py-2 font-semibold text-red-700 underline underline-offset-4"
                          onClick={() => setConfirmingBookId(book.bookId)}
                          type="button"
                        >
                          Remove book
                        </button>
                      </details>
                    ) : null}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
