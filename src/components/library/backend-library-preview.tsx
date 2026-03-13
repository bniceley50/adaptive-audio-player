import { CloudLibraryBookCard } from "@/components/library/cloud-library-book-card";
import { getBookCoverTheme, getBookInitials } from "@/features/reader/shared-support";
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

        {removedBooks.length > 0 ? (
          <div className="mt-5 rounded-[1.6rem] border border-rose-200 bg-[linear-gradient(180deg,#fff7f5_0%,#ffffff_100%)] p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-rose-700">
                  Removed in cloud
                </p>
                <h3 className="mt-2 text-lg font-semibold text-stone-950">
                  Cloud removals stay authoritative
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
                  When a title is removed in one workspace, synced routes recover into
                  restore mode instead of reopening stale browser state.
                </p>
              </div>
              <span className="rounded-full border border-rose-200 bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-rose-700">
                {removedBooks.length} removed
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {removedBooks.map((book) => (
                <article
                  key={book.book.bookId}
                  className="rounded-[1.2rem] border border-rose-100 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-20 w-16 shrink-0 flex-col justify-between overflow-hidden rounded-[1rem] border border-stone-200 bg-gradient-to-br ${getBookCoverTheme(book.book.title)} p-2.5 shadow-sm`}
                    >
                      <p className="text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-stone-600">
                        Removed
                      </p>
                      <p className="text-lg font-semibold tracking-tight text-stone-950">
                        {getBookInitials(book.book.title)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-950">
                        {book.book.title}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-stone-500">
                        Removed {new Date(book.removedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
