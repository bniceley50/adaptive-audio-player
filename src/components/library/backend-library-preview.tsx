import { CloudLibraryBookCard } from "@/components/library/cloud-library-book-card";
import { CloudRemovedBooksCard } from "@/components/library/cloud-removed-books-card";
import type { LibrarySyncSnapshot } from "@/lib/backend/types";

function resolvePreviewPath(bookId: string, snapshot: LibrarySyncSnapshot) {
  const playbackState = snapshot.playbackStates.find(
    (entry) => entry.bookId === bookId,
  )?.state;
  const playbackArtifact = playbackState?.playbackArtifactKind ?? null;
  if (playbackState) {
    return {
      href:
        playbackArtifact === "full-book-generation"
          ? `/player/${bookId}?artifact=full`
          : playbackArtifact === "sample-generation"
            ? `/player/${bookId}?artifact=sample`
            : `/player/${bookId}`,
      label: `Resume Chapter ${playbackState.currentChapterIndex + 1}`,
      status: "Saved listening session",
      playbackState,
    };
  }

  const fullBookOutput = snapshot.generationOutputs?.find(
    (output) => output.bookId === bookId && output.kind === "full-book-generation",
  );
  if (fullBookOutput?.assetPath) {
    return {
      href: `/player/${bookId}?artifact=full`,
      label: "Listen full book",
      status: "Full book ready",
      playbackState: null,
    };
  }

  const sampleOutput = snapshot.generationOutputs?.find(
    (output) => output.bookId === bookId && output.kind === "sample-generation",
  );
  if (sampleOutput?.assetPath) {
    return {
      href: `/player/${bookId}?artifact=sample`,
      label: "Open sample",
      status: "Sample ready",
      playbackState: null,
    };
  }

  return {
    href: `/books/${bookId}`,
    label: "Open setup",
    status: "Synced draft",
    playbackState: null,
  };
}

export function BackendLibraryPreview({
  snapshot,
}: {
  snapshot: LibrarySyncSnapshot | null;
}) {
  const books = snapshot?.libraryBooks.slice(0, 3) ?? [];
  const removedBooks = snapshot?.removedBooks?.slice(0, 3) ?? [];
  const readyBookCount = books.filter((book) =>
    snapshot?.generationOutputs?.some(
      (output) => output.bookId === book.bookId && !!output.assetPath,
    ),
  ).length;

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 bg-[linear-gradient(135deg,#fffaf0_0%,#fcfaf5_50%,#eef4ff_100%)] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              Cloud library
            </p>
            <h2 className="mt-2 text-lg font-semibold text-stone-900">
              Cloud library preview
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              A server-backed look at the books this library can restore, resume,
              or open even before the local shelf fully hydrates.
            </p>
          </div>
          <span className="rounded-full border border-white/80 bg-white/80 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-600 backdrop-blur">
            {books.length} shown
          </span>
        </div>
      </div>

      <div className="p-6">
        <div className="flex flex-wrap gap-3">
          <div className="rounded-2xl border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] px-4 py-3 shadow-sm">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
              Books in cloud
            </p>
            <p className="mt-2 text-2xl font-semibold text-stone-950">{books.length}</p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-[linear-gradient(180deg,#eefbf5_0%,#ffffff_100%)] px-4 py-3 shadow-sm">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
              Ready to listen
            </p>
            <p className="mt-2 text-2xl font-semibold text-stone-950">
              {readyBookCount}
            </p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-[linear-gradient(180deg,#f4f8ff_0%,#ffffff_100%)] px-4 py-3 shadow-sm">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
              Smart restore
            </p>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Books with audio reopen in the player. Draft-only books return to setup.
            </p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-[linear-gradient(180deg,#fff4f2_0%,#ffffff_100%)] px-4 py-3 shadow-sm">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
              Removed in cloud
            </p>
            <p className="mt-2 text-2xl font-semibold text-stone-950">
              {removedBooks.length}
            </p>
          </div>
        </div>

        {books.length > 0 ? (
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {books.map((book) => {
              const preview = resolvePreviewPath(
                book.bookId,
                snapshot as LibrarySyncSnapshot,
              );

              return (
                <CloudLibraryBookCard
                  key={book.bookId}
                  book={book}
                  snapshot={snapshot as LibrarySyncSnapshot}
                  preview={preview}
                />
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm text-stone-700">
            No cloud books yet. Import a book and let sync finish to see it here.
          </div>
        )}

        <CloudRemovedBooksCard removedBooks={removedBooks} />
      </div>
    </section>
  );
}
