// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  readLocalDraftText,
  readLocalGenerationOutputs,
  readLocalLibraryBook,
  readLocalListeningProfile,
  readLocalSampleRequest,
  readRemovedLocalLibraryBook,
  replaceRemovedLocalLibraryBooks,
  upsertLocalLibraryBook,
  writeLocalDraftText,
  writeLocalGenerationOutput,
  writeLocalListeningProfile,
  writeLocalSampleRequest,
  type RemovedLocalLibraryBook,
} from "@/lib/library/local-library";
import {
  readPersistedPlaybackState,
  writePersistedPlaybackState,
} from "@/lib/playback/local-playback";

describe("replaceRemovedLocalLibraryBooks", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem(key: string) {
          return store.has(key) ? store.get(key)! : null;
        },
        setItem(key: string, value: string) {
          store.set(key, value);
        },
        removeItem(key: string) {
          store.delete(key);
        },
      },
    });
  });

  it("removes active local state for backend-removed books", () => {
    upsertLocalLibraryBook({
      bookId: "demo-book-2",
      title: "Quiet Harbor Revised",
      chapterCount: 3,
      updatedAt: new Date().toISOString(),
      coverTheme: "from-sky-200 via-cyan-100 to-white",
      coverLabel: "Harbor",
      coverGlyph: "QH",
      genreLabel: "Coastal mystery",
    });
    writeLocalDraftText("demo-book-2", "Chapter 1\nHello there");
    writeLocalListeningProfile({
      bookId: "demo-book-2",
      narratorId: "sloane",
      narratorName: "Sloane",
      mode: "immersive",
    });
    writeLocalSampleRequest({
      bookId: "demo-book-2",
      narratorId: "sloane",
      mode: "immersive",
    });
    writePersistedPlaybackState("demo-book-2", {
      currentChapterIndex: 1,
      progressSeconds: 48,
      speed: 1.1,
      isBookmarked: true,
      sleepTimerMinutes: 15,
      playbackArtifactKind: "sample-generation",
      bookmarks: [
        {
          id: "bookmark-1",
          chapterIndex: 1,
          progressSeconds: 48,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    writeLocalGenerationOutput({
      workspaceId: "workspace-1",
      bookId: "demo-book-2",
      kind: "sample-generation",
      narratorId: "sloane",
      mode: "immersive",
      chapterCount: 3,
      assetPath: "/audio/demo-book-2-sample.mp3",
      mimeType: "audio/mpeg",
      provider: "mock",
      generatedAt: new Date().toISOString(),
    });

    const removedSnapshot: RemovedLocalLibraryBook = {
      book: {
        bookId: "demo-book-2",
        title: "Quiet Harbor Revised",
        chapterCount: 3,
        updatedAt: new Date().toISOString(),
        coverTheme: "from-sky-200 via-cyan-100 to-white",
        coverLabel: "Harbor",
        coverGlyph: "QH",
        genreLabel: "Coastal mystery",
      },
      draftText: "Chapter 1\nHello there",
      profile: {
        bookId: "demo-book-2",
        narratorId: "sloane",
        narratorName: "Sloane",
        mode: "immersive",
      },
      sampleRequest: {
        bookId: "demo-book-2",
        narratorId: "sloane",
        mode: "immersive",
      },
      playbackState: {
        currentChapterIndex: 1,
        progressSeconds: 48,
        speed: 1.1,
        isBookmarked: true,
        sleepTimerMinutes: 15,
        playbackArtifactKind: "sample-generation",
        bookmarks: [
          {
            id: "bookmark-1",
            chapterIndex: 1,
            progressSeconds: 48,
            createdAt: new Date().toISOString(),
          },
        ],
      },
      generationOutputs: [
        {
          workspaceId: "workspace-1",
          bookId: "demo-book-2",
          kind: "sample-generation",
          narratorId: "sloane",
          mode: "immersive",
          chapterCount: 3,
          assetPath: "/audio/demo-book-2-sample.mp3",
          mimeType: "audio/mpeg",
          provider: "mock",
          generatedAt: new Date().toISOString(),
        },
      ],
      removedAt: new Date().toISOString(),
    };

    replaceRemovedLocalLibraryBooks([removedSnapshot]);

    expect(readLocalLibraryBook("demo-book-2")).toBeNull();
    expect(readLocalDraftText("demo-book-2")).toBe("");
    expect(readLocalListeningProfile("demo-book-2")).toBeNull();
    expect(readLocalSampleRequest()).toBeNull();
    expect(readPersistedPlaybackState("demo-book-2")).toBeNull();
    expect(
      readLocalGenerationOutputs().filter((output) => output.bookId === "demo-book-2"),
    ).toHaveLength(0);
    expect(readRemovedLocalLibraryBook("demo-book-2")?.book.title).toBe(
      "Quiet Harbor Revised",
    );
  });
});
