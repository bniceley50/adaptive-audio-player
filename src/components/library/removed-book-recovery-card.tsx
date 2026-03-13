"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { pushClientLibrarySyncSnapshot } from "@/lib/backend/client-sync";
import {
  clearRemovedLocalLibraryBook,
  formatRelativeUpdatedAt,
  restoreRemovedLocalLibraryBook,
  type RemovedLocalLibraryBook,
} from "@/lib/library/local-library";

export function RemovedBookRecoveryCard({
  removedBook,
  returnHref,
}: {
  removedBook: RemovedLocalLibraryBook;
  returnHref: string;
}) {
  const router = useRouter();

  return (
    <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
      <p className="text-sm uppercase tracking-[0.22em] text-amber-700">Recently removed</p>
      <h2 className="mt-3 text-2xl font-semibold text-stone-950">
        {removedBook.book.title} was removed from your library
      </h2>
      <p className="mt-3 text-sm leading-6 text-stone-700">
        {formatRelativeUpdatedAt(removedBook.removedAt).replace("Updated", "Removed")} from your
        local shelf. You can restore it here or dismiss the recovery prompt if you
        meant to delete it.
      </p>
      <div className="mt-4 flex flex-wrap gap-3 text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
        <span className="rounded-full bg-white px-3 py-2">
          Chapters: {removedBook.book.chapterCount}
        </span>
        <span className="rounded-full bg-white px-3 py-2">
          Saved taste: {removedBook.profile ? "yes" : "no"}
        </span>
        <span className="rounded-full bg-white px-3 py-2">
          Playback saved: {removedBook.playbackState ? "yes" : "no"}
        </span>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          className="rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white"
          type="button"
          onClick={async () => {
            restoreRemovedLocalLibraryBook(removedBook.book.bookId);
            await pushClientLibrarySyncSnapshot().catch(() => null);
            router.push(returnHref);
          }}
        >
          Restore this book
        </button>
        <button
          className="rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700"
          type="button"
          onClick={async () => {
            clearRemovedLocalLibraryBook(removedBook.book.bookId);
            await pushClientLibrarySyncSnapshot().catch(() => null);
            router.push(returnHref);
          }}
        >
          Dismiss recovery
        </button>
        <Link
          className="rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700"
          href={returnHref}
        >
          Back to library
        </Link>
      </div>
    </section>
  );
}
