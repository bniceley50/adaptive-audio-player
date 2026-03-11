"use client";

import {
  readDefaultListeningProfile,
  readLocalDraftText,
  readLocalLibraryBooks,
  readLocalListeningProfiles,
  readRemovedLocalLibraryBooks,
  readLocalSampleRequest,
} from "@/lib/library/local-library";
import {
  readPlaybackDefaults,
  readPersistedPlaybackState,
} from "@/lib/playback/local-playback";

export function buildClientLibrarySyncSnapshot() {
  const libraryBooks = readLocalLibraryBooks();

  return {
    libraryBooks,
    removedBooks: readRemovedLocalLibraryBooks(),
    draftTexts: libraryBooks.map((book) => ({
      bookId: book.bookId,
      text: readLocalDraftText(book.bookId),
    })),
    listeningProfiles: readLocalListeningProfiles(),
    defaultListeningProfile: readDefaultListeningProfile(),
    sampleRequest: readLocalSampleRequest(),
    playbackStates: libraryBooks
      .map((book) => {
        const state = readPersistedPlaybackState(book.bookId);
        return state
          ? {
              bookId: book.bookId,
              state,
            }
          : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    playbackDefaults: readPlaybackDefaults(),
    syncedAt: new Date().toISOString(),
  };
}

export async function pushClientLibrarySyncSnapshot() {
  return fetch("/api/sync/library", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(buildClientLibrarySyncSnapshot()),
  });
}
