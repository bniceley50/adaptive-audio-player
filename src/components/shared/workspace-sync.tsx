"use client";

import { useEffect, useRef } from "react";

import { buildClientLibrarySyncSnapshot } from "@/lib/backend/client-sync";
import {
  type LocalLibraryBook,
  type LocalListeningProfile,
  type LocalSampleRequest,
  defaultTasteChangedEvent,
  libraryChangedEvent,
  listeningProfileChangedEvent,
  readLocalLibraryBooks,
  removedBooksChangedEvent,
  sampleRequestChangedEvent,
  upsertLocalLibraryBook,
  writeDefaultListeningProfile,
  writeLocalDraftText,
  writeLocalGenerationOutput,
  writeLocalListeningProfile,
  writeLocalSampleRequest,
} from "@/lib/library/local-library";
import {
  playbackChangedEvent,
  playbackDefaultsChangedEvent,
  writePlaybackDefaults,
  writePersistedPlaybackState,
} from "@/lib/playback/local-playback";
import type { LibrarySyncSnapshot } from "@/lib/backend/types";
import { workspaceContextChangedEvent } from "@/lib/library/local-state";

export function WorkspaceSync() {
  const timeoutRef = useRef<number | null>(null);
  const workspaceTransitionRef = useRef(false);

  useEffect(() => {
    async function syncSnapshot() {
      await fetch("/api/sync/library", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(buildClientLibrarySyncSnapshot()),
      }).catch(() => {
        // Keep the local-first UX intact if backend sync fails.
      });
    }

    function scheduleSync() {
      if (workspaceTransitionRef.current) {
        return;
      }

      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = window.setTimeout(() => {
        void syncSnapshot();
      }, 250);
    }

    function restoreSnapshot(snapshot: LibrarySyncSnapshot) {
      for (const book of snapshot.libraryBooks as LocalLibraryBook[]) {
        upsertLocalLibraryBook(book);
      }

      for (const draft of snapshot.draftTexts) {
        writeLocalDraftText(draft.bookId, draft.text);
      }

      for (const profile of snapshot.listeningProfiles as LocalListeningProfile[]) {
        writeLocalListeningProfile(profile);
      }

      if (snapshot.defaultListeningProfile) {
        writeDefaultListeningProfile(
          snapshot.defaultListeningProfile as LocalListeningProfile,
        );
      }

      if (snapshot.sampleRequest) {
        writeLocalSampleRequest(snapshot.sampleRequest as LocalSampleRequest);
      }

      for (const output of snapshot.generationOutputs ?? []) {
        writeLocalGenerationOutput(output);
      }

      if (snapshot.playbackDefaults) {
        writePlaybackDefaults(snapshot.playbackDefaults);
      }

      for (const playbackState of snapshot.playbackStates) {
        writePersistedPlaybackState(playbackState.bookId, playbackState.state);
      }
    }

    async function initializeSync() {
      const localBooks = readLocalLibraryBooks();
      if (localBooks.length > 0) {
        workspaceTransitionRef.current = false;
        scheduleSync();
        return;
      }

      const response = await fetch("/api/sync/library").catch(() => null);
      const payload = response
        ? ((await response.json()) as {
            snapshot: LibrarySyncSnapshot | null;
          })
        : null;

      if (payload?.snapshot && payload.snapshot.libraryBooks.length > 0) {
        restoreSnapshot(payload.snapshot);
        workspaceTransitionRef.current = false;
        return;
      }

      workspaceTransitionRef.current = false;
      scheduleSync();
    }

    void initializeSync();

    function handleWorkspaceContextChanged() {
      workspaceTransitionRef.current = true;
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      void initializeSync();
    }

    const events = [
      libraryChangedEvent,
      listeningProfileChangedEvent,
      defaultTasteChangedEvent,
      sampleRequestChangedEvent,
      removedBooksChangedEvent,
      playbackChangedEvent,
      playbackDefaultsChangedEvent,
      "storage",
    ] as const;

    for (const eventName of events) {
      window.addEventListener(eventName, scheduleSync);
    }
    window.addEventListener(
      workspaceContextChangedEvent,
      handleWorkspaceContextChanged,
    );

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }

      for (const eventName of events) {
        window.removeEventListener(eventName, scheduleSync);
      }
      window.removeEventListener(
        workspaceContextChangedEvent,
        handleWorkspaceContextChanged,
      );
    };
  }, []);

  return null;
}
