import Link from "next/link";

import {
  getBookCoverTheme,
  getBookInitials,
} from "@/features/reader/shared-support";
import type { LibrarySyncSnapshot } from "@/lib/backend/types";

function getSyncedBookCoverTheme(book: LibrarySyncSnapshot["libraryBooks"][number]) {
  return book.coverTheme ?? getBookCoverTheme(book.title);
}

function getSyncedBookCoverGlyph(book: LibrarySyncSnapshot["libraryBooks"][number]) {
  return book.coverGlyph ?? getBookInitials(book.title);
}

function formatPlaybackTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function buildRenderPlayerHref(input: {
  bookId: string;
  kind: "sample-generation" | "full-book-generation";
  narratorId: string | null;
  mode: string | null;
}) {
  const params = new URLSearchParams({
    artifact: input.kind === "full-book-generation" ? "full" : "sample",
    renderState: "current",
  });

  if (input.narratorId) {
    params.set("narrator", input.narratorId);
  }

  if (input.mode) {
    params.set("mode", input.mode);
  }

  return `/player/${input.bookId}?${params.toString()}`;
}

export function CloudLibraryBookCard({
  book,
  snapshot,
  preview,
}: {
  book: LibrarySyncSnapshot["libraryBooks"][number];
  snapshot: LibrarySyncSnapshot;
  preview: {
    href: string;
    label: string;
    status: string;
    playbackState: {
      currentChapterIndex: number;
      progressSeconds: number;
      playbackArtifactKind?: string | null;
    } | null;
  };
}) {
  const sampleOutput =
    snapshot.generationOutputs?.find(
      (output) => output.bookId === book.bookId && output.kind === "sample-generation",
    ) ?? null;
  const fullBookOutput =
    snapshot.generationOutputs?.find(
      (output) => output.bookId === book.bookId && output.kind === "full-book-generation",
    ) ?? null;
  const renderCount = Number(!!sampleOutput) + Number(!!fullBookOutput);
  const activeRender = fullBookOutput ?? sampleOutput;

  return (
    <article className="rounded-[1.6rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-24 w-20 shrink-0 flex-col justify-between overflow-hidden rounded-[1.2rem] border border-stone-200 bg-gradient-to-br ${getSyncedBookCoverTheme(book)} p-3 shadow-sm`}
        >
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-stone-600">
            {book.coverLabel ?? "Sync"}
          </p>
          <p className="text-xl font-semibold tracking-tight text-stone-950">
            {getSyncedBookCoverGlyph(book)}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {book.genreLabel ? (
              <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-fuchsia-700">
                {book.genreLabel}
              </span>
            ) : null}
            <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-stone-600">
              {preview.status}
            </span>
            {renderCount > 0 ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-emerald-700">
                {renderCount} render{renderCount === 1 ? "" : "s"} ready
              </span>
            ) : null}
          </div>
          <h3 className="mt-3 text-lg font-semibold text-stone-950">{book.title}</h3>
          <p className="mt-2 text-sm text-stone-600">
            {book.chapterCount} chapter{book.chapterCount === 1 ? "" : "s"}
          </p>
          {preview.playbackState ? (
            <p className="mt-2 text-sm text-stone-500">
              Last session: Chapter {preview.playbackState.currentChapterIndex + 1}
              {" · "}
              {formatPlaybackTime(preview.playbackState.progressSeconds)}
              {preview.playbackState.playbackArtifactKind === "full-book-generation"
                ? " · full book"
                : preview.playbackState.playbackArtifactKind === "sample-generation"
                  ? " · sample"
                  : ""}
            </p>
          ) : activeRender ? (
            <p className="mt-2 text-sm text-stone-500">
              Ready with {activeRender.narratorId ?? "unknown narrator"} in{" "}
              {activeRender.mode ?? "unknown mode"}.
            </p>
          ) : (
            <p className="mt-2 text-sm text-stone-500">
              Draft synced and ready for narration setup.
            </p>
          )}
        </div>
      </div>

      {renderCount > 0 ? (
        <div className="mt-4 rounded-[1.2rem] border border-stone-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
              Ready right now
            </p>
            <p className="text-xs text-stone-500">
              Updated {new Date(book.updatedAt).toLocaleString()}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {fullBookOutput ? (
              <Link
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100"
                href={buildRenderPlayerHref({
                  bookId: book.bookId,
                  kind: "full-book-generation",
                  narratorId: fullBookOutput.narratorId,
                  mode: fullBookOutput.mode,
                })}
              >
                Current full book
              </Link>
            ) : null}
            {sampleOutput ? (
              <Link
                className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-800 transition hover:border-amber-300 hover:bg-amber-100"
                href={buildRenderPlayerHref({
                  bookId: book.bookId,
                  kind: "sample-generation",
                  narratorId: sampleOutput.narratorId,
                  mode: sampleOutput.mode,
                })}
              >
                Current sample
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-stone-500">
          Updated {new Date(book.updatedAt).toLocaleString()}
        </p>
      )}

      <Link
        className="mt-4 inline-flex rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
        href={preview.href}
      >
        {preview.label}
      </Link>
    </article>
  );
}
