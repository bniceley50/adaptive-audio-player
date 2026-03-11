"use client";

import type { LibrarySyncSnapshot } from "./types.ts";
import {
  upsertLocalLibraryBook,
  writeDefaultListeningProfile,
  writeLocalDraftText,
  writeLocalGenerationOutput,
  writeLocalListeningProfile,
  writeLocalSampleRequest,
} from "@/lib/library/local-library";
import {
  writePlaybackDefaults,
  writePersistedPlaybackState,
} from "@/lib/playback/local-playback";

export async function restoreBookFromBackendSnapshot(bookId: string) {
  const response = await fetch("/api/sync/library").catch(() => null);
  if (!response?.ok) {
    return "missing" as const;
  }

  const payload = (await response.json().catch(() => null)) as
    | { snapshot: LibrarySyncSnapshot | null }
    | null;
  const snapshot = payload?.snapshot;

  if (!snapshot) {
    return "missing" as const;
  }

  const syncedBook =
    snapshot.libraryBooks.find((book) => book.bookId === bookId) ?? null;
  if (!syncedBook) {
    return "missing" as const;
  }

  upsertLocalLibraryBook(syncedBook);

  const draftText = snapshot.draftTexts.find((draft) => draft.bookId === bookId);
  if (draftText) {
    writeLocalDraftText(bookId, draftText.text);
  }

  const listeningProfile = snapshot.listeningProfiles.find(
    (profile) => profile.bookId === bookId,
  );
  if (listeningProfile) {
    writeLocalListeningProfile(listeningProfile);
  }

  if (snapshot.defaultListeningProfile) {
    writeDefaultListeningProfile(snapshot.defaultListeningProfile);
  }

  if (snapshot.sampleRequest?.bookId === bookId) {
    writeLocalSampleRequest(snapshot.sampleRequest);
  }

  const generatedSample = snapshot.generationOutputs?.find(
    (output) =>
      output.bookId === bookId &&
      output.kind === "sample-generation" &&
      output.narratorId &&
      output.mode,
  );

  if (
    generatedSample &&
    generatedSample.narratorId &&
    generatedSample.mode
  ) {
    writeLocalSampleRequest({
      bookId,
      narratorId: generatedSample.narratorId,
      mode: generatedSample.mode,
    });
  }

  for (const output of snapshot.generationOutputs?.filter(
    (entry) => entry.bookId === bookId,
  ) ?? []) {
    writeLocalGenerationOutput(output);
  }

  const playbackState = snapshot.playbackStates.find(
    (entry) => entry.bookId === bookId,
  );
  if (playbackState) {
    writePersistedPlaybackState(bookId, playbackState.state);
  }

  if (snapshot.playbackDefaults) {
    writePlaybackDefaults(snapshot.playbackDefaults);
  }

  return "restored" as const;
}
