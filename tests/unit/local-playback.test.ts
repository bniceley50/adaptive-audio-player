import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BookProgressRequestError,
  createBookProgressWriter,
  loadBookProgress,
  putBookProgress,
  readPersistedPlaybackState,
  resolvePreferredPlaybackState,
  writePersistedPlaybackState,
  type BookProgress,
  type BookProgressSnapshot,
  type PersistedPlaybackState,
} from "@/lib/playback/local-playback";

function buildProgress(
  revision: number,
  overrides: Partial<BookProgress> = {},
): BookProgress {
  return {
    bookId: "book-progress",
    artifactId: "artifact-current",
    positionSeconds: 15,
    durationSeconds: 120,
    speed: 1,
    chapterIndex: 0,
    revision,
    updatedAt: "2026-07-19T12:00:00.000Z",
    ...overrides,
  };
}

function buildProgressSnapshot(
  positionSeconds: number,
  overrides: Partial<BookProgressSnapshot> = {},
): BookProgressSnapshot {
  return {
    positionSeconds,
    durationSeconds: 120,
    speed: 1,
    chapterIndex: 0,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function buildPlaybackState(
  updatedAt: string,
  progressSeconds: number,
): PersistedPlaybackState {
  return {
    currentChapterIndex: 0,
    progressSeconds,
    speed: 1,
    isBookmarked: false,
    sleepTimerMinutes: null,
    playbackArtifactKind: "sample-generation",
    bookmarks: [],
    updatedAt,
  };
}

describe("resolvePreferredPlaybackState", () => {
  it("returns backend state when local state is missing", () => {
    const backendState = buildPlaybackState("2026-03-11T10:00:00.000Z", 120);

    expect(resolvePreferredPlaybackState(null, backendState)).toEqual(backendState);
  });

  it("returns the newer backend state when it is fresher than local", () => {
    const localState = buildPlaybackState("2026-03-11T10:00:00.000Z", 45);
    const backendState = buildPlaybackState("2026-03-11T10:05:00.000Z", 90);

    expect(resolvePreferredPlaybackState(localState, backendState)).toEqual(
      backendState,
    );
  });

  it("keeps the local state when it is newer than backend", () => {
    const localState = buildPlaybackState("2026-03-11T10:05:00.000Z", 90);
    const backendState = buildPlaybackState("2026-03-11T10:00:00.000Z", 45);

    expect(resolvePreferredPlaybackState(localState, backendState)).toEqual(
      localState,
    );
  });

  it("keeps generated artifact kinds and discards legacy playback kinds", () => {
    const getItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { getItem } });

    for (const [storedKind, expectedKind] of [
      ["sample-generation", "sample-generation"],
      ["full-book-generation", "full-book-generation"],
      ["imported-audio", null],
      ["unknown", null],
    ] as const) {
      getItem.mockReturnValueOnce(
        JSON.stringify({
          ...buildPlaybackState("2026-07-19T12:00:00.000Z", 12),
          playbackArtifactKind: storedKind,
        }),
      );

      expect(
        readPersistedPlaybackState("book-progress")?.playbackArtifactKind,
      ).toBe(expectedKind);
    }
  });

  it("supports optimistic local state without notifying the legacy sync path", () => {
    const dispatchEvent = vi.fn();
    const setItem = vi.fn();
    vi.stubGlobal("window", {
      dispatchEvent,
      localStorage: { setItem },
    });

    writePersistedPlaybackState(
      "book-progress",
      buildPlaybackState("2026-07-19T12:00:00.000Z", 12),
      { notify: false },
    );

    expect(setItem).toHaveBeenCalledOnce();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});

describe("explicit book progress requests", () => {
  it("loads the current server revision without caching the response", async () => {
    const progress = buildProgress(7);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ progress }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadBookProgress("book-progress")).resolves.toEqual(progress);
    expect(fetchMock).toHaveBeenCalledWith("/api/books/book-progress/progress", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal: undefined,
    });
  });

  it("sends only the bounded progress fields and supports unload keepalive", async () => {
    const progress = buildProgress(4, { positionSeconds: 45, speed: 1.25 });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ progress }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      putBookProgress({
        bookId: "book-progress",
        artifactId: "artifact-current",
        revision: 3,
        snapshot: buildProgressSnapshot(45, { speed: 1.25 }),
        keepalive: true,
      }),
    ).resolves.toEqual(progress);

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/books/book-progress/progress");
    expect(request).toMatchObject({
      method: "PUT",
      cache: "no-store",
      credentials: "same-origin",
      keepalive: true,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
    });
    expect(JSON.parse(request.body as string)).toEqual({
      artifactId: "artifact-current",
      positionSeconds: 45,
      durationSeconds: 120,
      speed: 1.25,
      chapterIndex: 0,
      revision: 3,
    });
    expect(request.body).not.toContain("manuscript");
    expect(request.body).not.toContain("libraryBooks");
  });
});

describe("createBookProgressWriter", () => {
  it("does not write below the interval and performs four small writes in 60 seconds", async () => {
    let now = 0;
    const sent: Array<{ revision: number; snapshot: BookProgressSnapshot }> = [];
    const send = vi.fn(async (request) => {
      sent.push({ revision: request.revision, snapshot: request.snapshot });
      return buildProgress(request.revision + 1, request.snapshot);
    });
    const writer = createBookProgressWriter({
      bookId: "book-progress",
      artifactId: "artifact-current",
      initialRevision: 0,
      now: () => now,
      send,
    });

    for (let second = 1; second <= 60; second += 1) {
      now = second * 1_000;
      await writer.record(buildProgressSnapshot(second));
    }

    expect(send).toHaveBeenCalledTimes(4);
    expect(sent.map((entry) => entry.snapshot.positionSeconds)).toEqual([
      15, 30, 45, 60,
    ]);
    expect(sent.map((entry) => entry.revision)).toEqual([0, 1, 2, 3]);
  });

  it("flushes pause and seek state immediately without duplicating unchanged state", async () => {
    const send = vi.fn(async (request) =>
      buildProgress(request.revision + 1, request.snapshot),
    );
    const writer = createBookProgressWriter({
      bookId: "book-progress",
      artifactId: "artifact-current",
      initialRevision: 2,
      now: () => 1_000,
      send,
    });

    await expect(writer.flush(buildProgressSnapshot(9))).resolves.toBe(true);
    await expect(writer.flush(buildProgressSnapshot(30))).resolves.toBe(true);
    await expect(writer.flush(buildProgressSnapshot(30))).resolves.toBe(false);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([request]) => request.revision)).toEqual([2, 3]);
  });

  it("flushes ended state at duration and marks unload requests keepalive", async () => {
    const send = vi.fn(async (request) =>
      buildProgress(request.revision + 1, request.snapshot),
    );
    const writer = createBookProgressWriter({
      bookId: "book-progress",
      artifactId: "artifact-current",
      initialRevision: 0,
      send,
    });

    await writer.flush(buildProgressSnapshot(120));
    await writer.flush(buildProgressSnapshot(95), { keepalive: true });

    expect(send.mock.calls[0]?.[0].snapshot).toMatchObject({
      positionSeconds: 120,
      durationSeconds: 120,
    });
    expect(send.mock.calls[1]?.[0].keepalive).toBe(true);
  });

  it("retains failed progress for retry and advances the revision only after success", async () => {
    let now = 0;
    const send = vi
      .fn()
      .mockRejectedValueOnce(new BookProgressRequestError(500))
      .mockImplementationOnce(async (request) =>
        buildProgress(request.revision + 1, request.snapshot),
      );
    const writer = createBookProgressWriter({
      bookId: "book-progress",
      artifactId: "artifact-current",
      initialRevision: 4,
      now: () => now,
      send,
    });

    await expect(writer.flush(buildProgressSnapshot(12))).resolves.toBe(false);
    now = 15_000;
    await expect(writer.record(buildProgressSnapshot(18))).resolves.toBe(true);

    expect(send.mock.calls.map(([request]) => request.revision)).toEqual([4, 4]);
    expect(send.mock.calls[1]?.[0].snapshot.positionSeconds).toBe(18);
  });

  it("reconciles a conflict revision before retrying the latest position", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new BookProgressRequestError(409, 8))
      .mockImplementationOnce(async (request) =>
        buildProgress(request.revision + 1, request.snapshot),
      );
    const writer = createBookProgressWriter({
      bookId: "book-progress",
      artifactId: "artifact-current",
      initialRevision: 5,
      send,
    });

    await writer.flush(buildProgressSnapshot(40));
    await writer.flush(buildProgressSnapshot(44));

    expect(send.mock.calls.map(([request]) => request.revision)).toEqual([5, 8]);
    expect(writer.getRevision()).toBe(9);
  });
});
