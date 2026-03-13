"use client";

import { getBookCoverTheme, getBookInitials } from "@/features/reader/shared-support";
import type { LibrarySyncSnapshot } from "@/lib/backend/types";

export function CloudRemovedBooksCard({
  removedBooks,
}: {
  removedBooks: NonNullable<LibrarySyncSnapshot["removedBooks"]>;
}) {
  if (removedBooks.length === 0) {
    return null;
  }

  return (
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
  );
}
