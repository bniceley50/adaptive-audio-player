import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  claimNextGenerationJob,
  completeGenerationJob,
  createAccountSession,
  enqueueGenerationJob,
  failGenerationJob,
  getAccountSessionById,
  getGenerationArtifactForJob,
  getGenerationOutputsForBook,
  getSocialCommunityPulse,
  getWorkerHeartbeat,
  listGenerationOutputHistoryForBook,
  listPublicSocialCircles,
  listPublicSocialMoments,
  getGenerationJob,
  getUserById,
  getWorkspaceLibrarySnapshot,
  getWorkspaceSyncSummary,
  getWorkspaceUser,
  linkWorkspaceToUser,
  listRecentSyncJobsForUser,
  listRecentSyncJobsForWorkspace,
  listRecentGenerationJobsForBook,
  listRecentSocialActivityEvents,
  listWorkspacesForUser,
  listAccountSessionsForUser,
  listEndedAccountSessionsForUser,
  revokeAccountSession,
  recordWorkerHeartbeat,
  resetDatabaseForTests,
  rotateUserSessionVersion,
  retryGenerationJob,
  syncWorkspaceLibrarySnapshot,
  upsertUserByEmail,
} from "@/lib/backend/sqlite";

describe("backend sqlite library sync", () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    resetDatabaseForTests();

    for (const dir of createdDirs.splice(0, createdDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }

    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
  });

  it("persists and reconciles a workspace snapshot", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const firstSummary = syncWorkspaceLibrarySnapshot("workspace-1", {
      libraryBooks: [
        {
          bookId: "book-1",
          title: "Storm Harbor",
          chapterCount: 2,
          updatedAt: "2026-03-08T12:00:00.000Z",
          coverTheme: "from-sky-200 via-cyan-100 to-white",
          coverLabel: "Noir coast",
          coverGlyph: "SH",
          genreLabel: "Mystery",
        },
        {
          bookId: "book-2",
          title: "Quiet Harbor",
          chapterCount: 1,
          updatedAt: "2026-03-08T12:01:00.000Z",
        },
      ],
      draftTexts: [
        { bookId: "book-1", text: "Chapter 1\nStorm" },
        { bookId: "book-2", text: "Chapter 1\nQuiet" },
      ],
      listeningProfiles: [
        {
          bookId: "book-1",
          narratorId: "sloane",
          narratorName: "Sloane",
          mode: "immersive",
        },
      ],
      defaultListeningProfile: {
        bookId: "book-1",
        narratorId: "sloane",
        narratorName: "Sloane",
        mode: "immersive",
      },
      sampleRequest: {
        bookId: "book-1",
        narratorId: "sloane",
        mode: "immersive",
      },
      playbackStates: [
        {
          bookId: "book-1",
          state: {
            currentChapterIndex: 1,
            progressSeconds: 33,
            speed: 1.15,
            isBookmarked: false,
            sleepTimerMinutes: 15,
            bookmarks: [],
            updatedAt: "2026-03-08T12:02:00.000Z",
          },
        },
      ],
      playbackDefaults: {
        speed: 1.15,
        sleepTimerMinutes: 15,
      },
      discoveryPreferences: {
        followedAuthors: ["Annie Hart"],
        joinedCircles: ["circle-storm-harbor"],
        trackedPlannedFeatures: ["private-audio-files"],
        followedAuthorTimestamps: {
          "Annie Hart": "2026-03-08T11:58:00.000Z",
        },
        joinedCircleTimestamps: {
          "circle-storm-harbor": "2026-03-08T11:59:00.000Z",
        },
        trackedFeatureTimestamps: {
          "private-audio-files": "2026-03-08T12:00:00.000Z",
        },
        pinnedDiscoverySignal: {
          kind: "circle",
          id: "circle-storm-harbor",
        },
        personalizationPaused: false,
      },
      socialState: {
        savedEditions: [
          {
            editionId: "cinematic-harbor",
            savedAt: "2026-03-08T12:00:30.000Z",
            lastUsedAt: "2026-03-08T12:01:30.000Z",
          },
        ],
        circleMemberships: [
          {
            circleId: "circle-storm-harbor",
            joinedAt: "2026-03-08T11:59:30.000Z",
            lastOpenedAt: "2026-03-08T12:02:30.000Z",
            shareCount: 2,
          },
        ],
        createdCircles: [],
        promotedMoments: [],
      },
      syncedAt: "2026-03-08T12:03:00.000Z",
    });

    expect(firstSummary?.syncedBookCount).toBe(2);
    expect(firstSummary?.syncedProfileCount).toBe(1);
    expect(firstSummary?.syncedPlaybackCount).toBe(1);
    expect(firstSummary?.generatedOutputCount).toBe(0);
    expect(firstSummary?.lastJobStatus).toBe("completed");

    const secondSummary = syncWorkspaceLibrarySnapshot("workspace-1", {
      libraryBooks: [
        {
          bookId: "book-1",
          title: "Storm Harbor Revised",
          chapterCount: 3,
          updatedAt: "2026-03-08T12:04:00.000Z",
          coverTheme: "from-emerald-200 via-teal-100 to-white",
          coverLabel: "Revised coast",
          coverGlyph: "SR",
          genreLabel: "Mystery",
        },
      ],
      draftTexts: [{ bookId: "book-1", text: "Chapter 1\nRevised" }],
      listeningProfiles: [],
      defaultListeningProfile: null,
      sampleRequest: null,
      playbackStates: [],
      playbackDefaults: null,
      discoveryPreferences: {
        followedAuthors: [],
        joinedCircles: [],
        trackedPlannedFeatures: ["richer-document-imports"],
        followedAuthorTimestamps: {},
        joinedCircleTimestamps: {},
        trackedFeatureTimestamps: {
          "richer-document-imports": "2026-03-08T12:04:30.000Z",
        },
        pinnedDiscoverySignal: {
          kind: "feature",
          id: "richer-document-imports",
        },
        personalizationPaused: true,
      },
      socialState: {
        savedEditions: [],
        circleMemberships: [
          {
            circleId: "created-harbor-warning-circle",
            joinedAt: "2026-03-08T12:04:35.000Z",
            lastOpenedAt: null,
            shareCount: 0,
          },
        ],
        createdCircles: [
          {
            id: "created-harbor-warning-circle",
            title: "Harbor Warning Circle",
            editionId: "cinematic-harbor",
            host: "You",
            bookTitle: "Storm Harbor Revised",
            memberCount: 1,
            checkpoint: "Chapter 1 and the harbor warning",
            vibe: "Moment-led close reading",
            summary: "A user-created public circle built from a promoted harbor line.",
            sourceMomentId: "promoted-harbor-warning",
            createdAt: "2026-03-08T12:04:34.000Z",
          },
        ],
        promotedMoments: [
          {
            id: "promoted-harbor-warning",
            bookId: "book-1",
            bookTitle: "Storm Harbor Revised",
            chapterIndex: 0,
            chapterLabel: "Chapter 1",
            progressSeconds: 94,
            quoteText: "The harbor kept its warnings polished and quiet.",
            promotedAt: "2026-03-08T12:04:40.000Z",
            editionId: "cinematic-harbor",
            circleId: "created-harbor-warning-circle",
          },
        ],
      },
      syncedAt: "2026-03-08T12:05:00.000Z",
    });

    expect(secondSummary?.syncedBookCount).toBe(1);
    expect(secondSummary?.syncedProfileCount).toBe(0);
    expect(secondSummary?.syncedPlaybackCount).toBe(0);
    expect(secondSummary?.generatedOutputCount).toBe(0);
    expect(getWorkspaceSyncSummary("workspace-1")?.syncedBookCount).toBe(1);
    expect(getWorkspaceLibrarySnapshot("workspace-1")).toMatchObject({
      libraryBooks: [
        {
          bookId: "book-1",
          title: "Storm Harbor Revised",
          chapterCount: 3,
          updatedAt: "2026-03-08T12:04:00.000Z",
          coverTheme: "from-emerald-200 via-teal-100 to-white",
          coverLabel: "Revised coast",
          coverGlyph: "SR",
          genreLabel: "Mystery",
        },
      ],
      discoveryPreferences: {
        followedAuthors: [],
        joinedCircles: [],
        trackedPlannedFeatures: ["richer-document-imports"],
        pinnedDiscoverySignal: {
          kind: "feature",
          id: "richer-document-imports",
        },
        personalizationPaused: true,
      },
      socialState: {
        savedEditions: [],
        circleMemberships: [
          {
            circleId: "created-harbor-warning-circle",
            joinedAt: "2026-03-08T12:04:35.000Z",
            lastOpenedAt: null,
            shareCount: 0,
          },
        ],
        createdCircles: [
          {
            id: "created-harbor-warning-circle",
            title: "Harbor Warning Circle",
            editionId: "cinematic-harbor",
            host: "You",
            bookTitle: "Storm Harbor Revised",
            memberCount: 1,
            checkpoint: "Chapter 1 and the harbor warning",
            vibe: "Moment-led close reading",
            summary: "A user-created public circle built from a promoted harbor line.",
            sourceMomentId: "promoted-harbor-warning",
            createdAt: "2026-03-08T12:04:34.000Z",
          },
        ],
        promotedMoments: [
          {
            id: "promoted-harbor-warning",
            bookId: "book-1",
            bookTitle: "Storm Harbor Revised",
            chapterIndex: 0,
            chapterLabel: "Chapter 1",
            progressSeconds: 94,
            quoteText: "The harbor kept its warnings polished and quiet.",
            promotedAt: "2026-03-08T12:04:40.000Z",
            editionId: "cinematic-harbor",
            circleId: "created-harbor-warning-circle",
          },
        ],
      },
    });

    const socialOwner = upsertUserByEmail({
      email: "host@example.com",
      displayName: "Harbor Host",
    });
    linkWorkspaceToUser("workspace-1", socialOwner.id);

    expect(listPublicSocialCircles()).toEqual([
      expect.objectContaining({
        id: "created-harbor-warning-circle",
        ownerWorkspaceId: "workspace-1",
        ownerUserId: socialOwner.id,
        ownerDisplayName: "Harbor Host",
        editionId: "cinematic-harbor",
        title: "Harbor Warning Circle",
      }),
    ]);
    expect(listPublicSocialMoments()).toEqual([
      expect.objectContaining({
        id: "promoted-harbor-warning",
        ownerWorkspaceId: "workspace-1",
        ownerUserId: socialOwner.id,
        ownerDisplayName: "Harbor Host",
        bookId: "book-1",
        bookTitle: "Storm Harbor Revised",
      }),
    ]);

    expect(getSocialCommunityPulse()).toMatchObject({
      totalSocialWorkspaces: 1,
      totalSavedEditions: 1,
      totalJoinedCircles: 2,
      totalPromotedMoments: 1,
      editionCounts: [
        {
          editionId: "cinematic-harbor",
          saves: 1,
          reuses: 1,
        },
      ],
      circleCounts: [
        {
          circleId: "circle-storm-harbor",
          joins: 1,
          reopens: 1,
          shares: 2,
        },
        {
          circleId: "created-harbor-warning-circle",
          joins: 1,
          reopens: 0,
          shares: 0,
        },
      ],
      momentCounts: [
        {
          momentId: "promoted-harbor-warning",
          promotions: 1,
        },
      ],
      lastSyncedAt: "2026-03-08T12:04:40.000Z",
    });

    expect(listRecentSocialActivityEvents(6)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "moment-promoted",
          subjectId: "promoted-harbor-warning",
          quantity: 1,
          metadata: expect.objectContaining({
            bookTitle: "Storm Harbor Revised",
            chapterLabel: "Chapter 1",
          }),
        }),
        expect.objectContaining({
          kind: "circle-joined",
          subjectId: "created-harbor-warning-circle",
          quantity: 1,
          metadata: expect.objectContaining({
            circleTitle: "Harbor Warning Circle",
            editionId: "cinematic-harbor",
          }),
        }),
        expect.objectContaining({
          kind: "circle-shared",
          subjectId: "circle-storm-harbor",
          quantity: 2,
        }),
        expect.objectContaining({
          kind: "edition-reused",
          subjectId: "cinematic-harbor",
          quantity: 1,
        }),
      ]),
    );

    syncWorkspaceLibrarySnapshot("workspace-1", {
      libraryBooks: [],
      draftTexts: [],
      listeningProfiles: [],
      defaultListeningProfile: null,
      sampleRequest: null,
      playbackStates: [],
      playbackDefaults: null,
      discoveryPreferences: null,
      socialState: {
        savedEditions: [],
        circleMemberships: [],
        createdCircles: [],
        promotedMoments: [],
      },
      syncedAt: "2026-03-08T12:06:00.000Z",
    });

    expect(listPublicSocialCircles()).toEqual([]);
    expect(listPublicSocialMoments()).toEqual([]);
  });

  it("creates users and links workspaces to them", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const user = upsertUserByEmail({
      email: "gillian@example.com",
      displayName: "Gillian",
    });

    expect(getUserById(user.id)?.email).toBe("gillian@example.com");
    expect(getUserById(user.id)?.sessionVersion).toBe(1);

    expect(rotateUserSessionVersion(user.id)?.sessionVersion).toBe(2);
    expect(getUserById(user.id)?.sessionVersion).toBe(2);
    const session = createAccountSession(
      user.id,
      "2026-04-08T12:10:00.000Z",
      "Safari on Mac",
    );
    expect(session?.userId).toBe(user.id);
    expect(session?.label).toBe("Safari on Mac");
    expect(listAccountSessionsForUser(user.id, session?.id)).toEqual([
      expect.objectContaining({
        id: session?.id,
        label: "Safari on Mac",
        isCurrent: true,
      }),
    ]);
    expect(getAccountSessionById(session?.id ?? "")?.revokedAt).toBeNull();
    expect(
      revokeAccountSession(session?.id ?? "", "signed-out")?.endedReason,
    ).toBe("signed-out");
    expect(listAccountSessionsForUser(user.id)).toEqual([]);
    expect(listEndedAccountSessionsForUser(user.id)).toEqual([
      expect.objectContaining({
        id: session?.id,
        endedReason: "signed-out",
      }),
    ]);

    syncWorkspaceLibrarySnapshot("workspace-2", {
      libraryBooks: [],
      draftTexts: [],
      listeningProfiles: [],
      defaultListeningProfile: null,
      sampleRequest: null,
      playbackStates: [],
      playbackDefaults: null,
      discoveryPreferences: null,
      socialState: null,
      syncedAt: "2026-03-08T12:10:00.000Z",
    });

    linkWorkspaceToUser("workspace-2", user.id);
    expect(getWorkspaceUser("workspace-2")?.displayName).toBe("Gillian");
    expect(listWorkspacesForUser(user.id, "workspace-2")).toEqual([
      {
        workspaceId: "workspace-2",
        syncedBookCount: 0,
        lastSyncedAt: "2026-03-08T12:10:00.000Z",
        latestBookId: null,
        latestBookTitle: null,
        latestBookCoverTheme: null,
        latestBookCoverLabel: null,
        latestBookCoverGlyph: null,
        latestBookGenreLabel: null,
        latestPlayableArtifactKind: null,
        latestSessionBookId: null,
        latestSessionBookTitle: null,
        latestSessionChapterIndex: null,
        latestSessionProgressSeconds: null,
        latestSessionArtifactKind: null,
        latestSessionUpdatedAt: null,
        latestResumePath: null,
        isCurrent: true,
      },
    ]);
  });

  it("excludes expired sessions from active session summaries", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const user = upsertUserByEmail({
      email: "expired@example.com",
      displayName: "Expired",
    });

    const activeSession = createAccountSession(
      user.id,
      "2099-04-08T12:10:00.000Z",
      "Chrome on Mac",
    );

    createAccountSession(
      user.id,
      "2000-04-08T12:10:00.000Z",
      "Safari on Mac",
    );

    expect(listAccountSessionsForUser(user.id, activeSession?.id)).toEqual([
      expect.objectContaining({
        id: activeSession?.id,
        label: "Chrome on Mac",
        isCurrent: true,
      }),
    ]);
  });

  it("prunes revoked and expired sessions during normal session activity", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const user = upsertUserByEmail({
      email: "prune@example.com",
      displayName: "Prune",
    });

    const revokedSession = createAccountSession(
      user.id,
      "2099-04-08T12:10:00.000Z",
      "Safari on Mac",
    );
    const recentlyExpiredAt = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();
    const expiredSession = createAccountSession(
      user.id,
      recentlyExpiredAt,
      "Chrome on Mac",
    );

    revokeAccountSession(revokedSession?.id ?? "", "signed-out");

    const activeSession = createAccountSession(
      user.id,
      "2099-05-08T12:10:00.000Z",
      "Edge on Mac",
    );

    expect(getAccountSessionById(revokedSession?.id ?? "")?.endedReason).toBe(
      "signed-out",
    );
    expect(getAccountSessionById(expiredSession?.id ?? "")).not.toBeNull();
    expect(listAccountSessionsForUser(user.id, activeSession?.id)).toEqual([
      expect.objectContaining({
        id: activeSession?.id,
        label: "Edge on Mac",
        isCurrent: true,
      }),
    ]);
    expect(listEndedAccountSessionsForUser(user.id)).toEqual([
      expect.objectContaining({
        id: revokedSession?.id,
        endedReason: "signed-out",
      }),
      expect.objectContaining({
        id: expiredSession?.id,
        endedReason: "expired",
      }),
    ]);
  });

  it("stores and updates worker heartbeat state", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    recordWorkerHeartbeat({
      workerName: "generation-worker",
      status: "idle",
      now: "2026-03-10T20:00:00.000Z",
    });

    expect(getWorkerHeartbeat()).toEqual({
      workerName: "generation-worker",
      status: "idle",
      startedAt: "2026-03-10T20:00:00.000Z",
      lastHeartbeatAt: "2026-03-10T20:00:00.000Z",
      lastJobId: null,
      lastJobKind: null,
      lastJobStatus: null,
    });

    recordWorkerHeartbeat({
      workerName: "generation-worker",
      status: "processing",
      lastJobId: "job-123",
      lastJobKind: "sample-generation",
      lastJobStatus: "running",
      now: "2026-03-10T20:01:00.000Z",
    });

    expect(getWorkerHeartbeat()).toEqual({
      workerName: "generation-worker",
      status: "processing",
      startedAt: "2026-03-10T20:00:00.000Z",
      lastHeartbeatAt: "2026-03-10T20:01:00.000Z",
      lastJobId: "job-123",
      lastJobKind: "sample-generation",
      lastJobStatus: "running",
    });
  });

  it("reuses an active matching generation job instead of enqueuing a duplicate", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    syncWorkspaceLibrarySnapshot("workspace-dedupe", {
      libraryBooks: [
        {
          bookId: "book-1",
          title: "Storm Harbor",
          chapterCount: 2,
          updatedAt: "2026-03-10T20:00:00.000Z",
        },
      ],
      draftTexts: [{ bookId: "book-1", text: "Chapter 1\nStorm Harbor" }],
      listeningProfiles: [],
      defaultListeningProfile: null,
      sampleRequest: null,
      playbackStates: [],
      playbackDefaults: null,
      syncedAt: "2026-03-10T20:01:00.000Z",
    });

    const firstJob = enqueueGenerationJob({
      workspaceId: "workspace-dedupe",
      kind: "sample-generation",
      bookId: "book-1",
      narratorId: "sloane",
      mode: "immersive",
    });
    const duplicateJob = enqueueGenerationJob({
      workspaceId: "workspace-dedupe",
      kind: "sample-generation",
      bookId: "book-1",
      narratorId: "sloane",
      mode: "immersive",
    });

    expect(duplicateJob?.id).toBe(firstJob?.id);
    expect(listRecentGenerationJobsForBook("workspace-dedupe", "book-1")).toHaveLength(1);
  });

  it("includes the latest synced book for each linked workspace", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const user = upsertUserByEmail({
      email: "reader@example.com",
      displayName: "Reader",
    });

    syncWorkspaceLibrarySnapshot("workspace-a", {
      libraryBooks: [
        {
          bookId: "book-a",
          title: "Earlier Title",
          chapterCount: 2,
          updatedAt: "2026-03-08T10:00:00.000Z",
        },
        {
          bookId: "book-b",
          title: "Latest Title",
          chapterCount: 3,
          updatedAt: "2026-03-08T11:00:00.000Z",
        },
      ],
      draftTexts: [
        { bookId: "book-a", text: "A" },
        { bookId: "book-b", text: "B" },
      ],
      listeningProfiles: [],
      defaultListeningProfile: null,
      sampleRequest: null,
      playbackStates: [],
      playbackDefaults: null,
      syncedAt: "2026-03-08T11:30:00.000Z",
    });

    linkWorkspaceToUser("workspace-a", user.id);

    expect(listWorkspacesForUser(user.id, "workspace-a")).toEqual([
      {
        workspaceId: "workspace-a",
        syncedBookCount: 2,
        lastSyncedAt: "2026-03-08T11:30:00.000Z",
        latestBookId: "book-b",
        latestBookTitle: "Latest Title",
        latestBookCoverTheme: null,
        latestBookCoverLabel: null,
        latestBookCoverGlyph: null,
        latestBookGenreLabel: null,
        latestPlayableArtifactKind: null,
        latestSessionBookId: null,
        latestSessionBookTitle: null,
        latestSessionChapterIndex: null,
        latestSessionProgressSeconds: null,
        latestSessionArtifactKind: null,
        latestSessionUpdatedAt: null,
        latestResumePath: "/books/book-b",
        isCurrent: true,
      },
    ]);
  });

  it("prefers a playable artifact when building workspace resume paths", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const user = upsertUserByEmail({
      email: "artifact-reader@example.com",
      displayName: "Artifact Reader",
    });

    syncWorkspaceLibrarySnapshot("workspace-artifact", {
      libraryBooks: [
        {
          bookId: "book-z",
          title: "Playable Title",
          chapterCount: 4,
          updatedAt: "2026-03-08T11:00:00.000Z",
        },
      ],
      draftTexts: [{ bookId: "book-z", text: "Chapter 1\nPlayable" }],
      listeningProfiles: [],
      defaultListeningProfile: null,
      sampleRequest: null,
      playbackStates: [],
      playbackDefaults: null,
      syncedAt: "2026-03-08T11:30:00.000Z",
    });
    linkWorkspaceToUser("workspace-artifact", user.id);

    const fullBookJob = enqueueGenerationJob({
      workspaceId: "workspace-artifact",
      kind: "full-book-generation",
      bookId: "book-z",
      narratorId: "sloane",
      mode: "immersive",
      chapterCount: 4,
    });

    expect(claimNextGenerationJob()?.id).toBe(fullBookJob?.id);
    completeGenerationJob(fullBookJob?.id ?? "", "workspace-artifact", {
      assetPath: "generated/workspace-artifact/book-z-full.wav",
      mimeType: "audio/wav",
      provider: "mock",
    });

    expect(listWorkspacesForUser(user.id, "workspace-artifact")).toEqual([
      {
        workspaceId: "workspace-artifact",
        syncedBookCount: 1,
        lastSyncedAt: "2026-03-08T11:30:00.000Z",
        latestBookId: "book-z",
        latestBookTitle: "Playable Title",
        latestBookCoverTheme: null,
        latestBookCoverLabel: null,
        latestBookCoverGlyph: null,
        latestBookGenreLabel: null,
        latestPlayableArtifactKind: "full-book-generation",
        latestSessionBookId: null,
        latestSessionBookTitle: null,
        latestSessionChapterIndex: null,
        latestSessionProgressSeconds: null,
        latestSessionArtifactKind: null,
        latestSessionUpdatedAt: null,
        latestResumePath: "/player/book-z?artifact=full",
        isCurrent: true,
      },
    ]);
  });

  it("prefers the latest synced listening session over a generic artifact resume path", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const user = upsertUserByEmail({
      email: "session-reader@example.com",
      displayName: "Session Reader",
    });

    syncWorkspaceLibrarySnapshot("workspace-session", {
      libraryBooks: [
        {
          bookId: "book-session",
          title: "Session Title",
          chapterCount: 3,
          updatedAt: "2026-03-08T11:00:00.000Z",
        },
      ],
      draftTexts: [{ bookId: "book-session", text: "Chapter 1\nSession" }],
      listeningProfiles: [],
      defaultListeningProfile: null,
      sampleRequest: null,
      playbackStates: [
        {
          bookId: "book-session",
          state: {
            currentChapterIndex: 1,
            progressSeconds: 73,
            speed: 1.15,
            isBookmarked: false,
            sleepTimerMinutes: 15,
            playbackArtifactKind: "sample-generation",
            bookmarks: [],
            updatedAt: "2026-03-08T11:45:00.000Z",
          },
        },
      ],
      playbackDefaults: null,
      syncedAt: "2026-03-08T11:46:00.000Z",
    });
    linkWorkspaceToUser("workspace-session", user.id);

    const summary = listWorkspacesForUser(user.id, "workspace-session");
    expect(summary).toEqual([
      {
        workspaceId: "workspace-session",
        syncedBookCount: 1,
        lastSyncedAt: "2026-03-08T11:46:00.000Z",
        latestBookId: "book-session",
        latestBookTitle: "Session Title",
        latestBookCoverTheme: null,
        latestBookCoverLabel: null,
        latestBookCoverGlyph: null,
        latestBookGenreLabel: null,
        latestPlayableArtifactKind: null,
        latestSessionBookId: "book-session",
        latestSessionBookTitle: "Session Title",
        latestSessionChapterIndex: 1,
        latestSessionProgressSeconds: 73,
        latestSessionArtifactKind: "sample-generation",
        latestSessionUpdatedAt: "2026-03-08T11:45:00.000Z",
        latestResumePath: "/player/book-session?artifact=sample",
        isCurrent: true,
      },
    ]);
  });

  it("lists recent sync jobs for a workspace and its signed-in user", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const user = upsertUserByEmail({
      email: "jobs@example.com",
      displayName: "Jobs",
    });

    syncWorkspaceLibrarySnapshot("workspace-jobs", {
      libraryBooks: [
        {
          bookId: "book-1",
          title: "Storm Harbor",
          chapterCount: 2,
          updatedAt: "2026-03-08T12:00:00.000Z",
        },
      ],
      draftTexts: [{ bookId: "book-1", text: "Chapter 1" }],
      listeningProfiles: [],
      defaultListeningProfile: null,
      sampleRequest: null,
      playbackStates: [],
      playbackDefaults: null,
      syncedAt: "2026-03-08T12:01:00.000Z",
    });

    linkWorkspaceToUser("workspace-jobs", user.id);

    const workspaceJobs = listRecentSyncJobsForWorkspace("workspace-jobs");
    expect(workspaceJobs).toHaveLength(1);
    expect(workspaceJobs[0]).toMatchObject({
      workspaceId: "workspace-jobs",
      kind: "library-sync",
      status: "completed",
      books: 1,
      profiles: 0,
      playbackStates: 0,
      bookTitle: null,
      playableArtifactKind: null,
      resumePath: null,
    });

    const userJobs = listRecentSyncJobsForUser(user.id);
    expect(userJobs).toHaveLength(1);
    expect(userJobs[0]?.workspaceId).toBe("workspace-jobs");

    const queuedJob = enqueueGenerationJob({
      workspaceId: "workspace-jobs",
      kind: "sample-generation",
      bookId: "book-1",
      narratorId: "sloane",
      mode: "immersive",
    });

    expect(queuedJob).toMatchObject({
      workspaceId: "workspace-jobs",
      kind: "sample-generation",
      status: "queued",
      bookId: "book-1",
      narratorId: "sloane",
      mode: "immersive",
    });

    const runningJob = claimNextGenerationJob();
    expect(runningJob?.status).toBe("running");
    expect(runningJob?.id).toBe(queuedJob?.id);
    const completedJob = completeGenerationJob(queuedJob?.id ?? "", "workspace-jobs");
    expect(completedJob?.status).toBe("completed");
    expect(getGenerationJob(queuedJob?.id ?? "", "workspace-jobs")?.status).toBe("completed");

    const queuedSecondSampleJob = enqueueGenerationJob({
      workspaceId: "workspace-jobs",
      kind: "sample-generation",
      bookId: "book-1",
      narratorId: "marlowe",
      mode: "classic",
    });

    claimNextGenerationJob();
    completeGenerationJob(queuedSecondSampleJob?.id ?? "", "workspace-jobs", {
      assetPath: "generated/workspace-jobs/book-1-sample-v2.wav",
      mimeType: "audio/wav",
      provider: "mock",
    });

    const latestWorkspaceJobs = listRecentSyncJobsForWorkspace("workspace-jobs");
    expect(latestWorkspaceJobs[0]).toMatchObject({
      workspaceId: "workspace-jobs",
      kind: "sample-generation",
      status: "completed",
      bookId: "book-1",
      bookTitle: "Storm Harbor",
      playableArtifactKind: "sample-generation",
      resumePath: "/player/book-1?artifact=sample",
    });
    expect(getGenerationOutputsForBook("workspace-jobs", "book-1")).toEqual([
      expect.objectContaining({
        workspaceId: "workspace-jobs",
        bookId: "book-1",
        kind: "sample-generation",
        narratorId: "marlowe",
        mode: "classic",
      }),
    ]);

    const queuedFullBookJob = enqueueGenerationJob({
      workspaceId: "workspace-jobs",
      kind: "full-book-generation",
      bookId: "book-1",
      narratorId: null,
      mode: null,
      chapterCount: 2,
    });

    expect(queuedFullBookJob).toMatchObject({
      kind: "full-book-generation",
      status: "queued",
      bookId: "book-1",
      chapterCount: 2,
    });

    const runningFullBookJob = claimNextGenerationJob();
    expect(runningFullBookJob).toMatchObject({
      kind: "full-book-generation",
      status: "running",
    });
    expect(runningFullBookJob?.id).toBe(queuedFullBookJob?.id);

    const completedFullBookJob = completeGenerationJob(
      queuedFullBookJob?.id ?? "",
      "workspace-jobs",
      {
        assetPath: "generated/workspace-jobs/book-1-full.wav",
        mimeType: "audio/wav",
        provider: "mock",
      },
    );
    expect(completedFullBookJob).toMatchObject({
      kind: "full-book-generation",
      status: "completed",
      bookId: "book-1",
      chapterCount: 2,
    });

    const bookJobs = listRecentGenerationJobsForBook("workspace-jobs", "book-1", 10);
    expect(bookJobs).toHaveLength(3);
    expect(bookJobs.map((job) => job.kind).sort()).toEqual([
      "full-book-generation",
      "sample-generation",
      "sample-generation",
    ]);
    expect(bookJobs.find((job) => job.kind === "full-book-generation")).toMatchObject({
      bookTitle: "Storm Harbor",
      playableArtifactKind: "full-book-generation",
      resumePath: "/player/book-1?artifact=full",
    });
    expect(getGenerationOutputsForBook("workspace-jobs", "book-1")).toEqual([
      expect.objectContaining({
        workspaceId: "workspace-jobs",
        bookId: "book-1",
        kind: "full-book-generation",
        chapterCount: 2,
      }),
      expect.objectContaining({
        workspaceId: "workspace-jobs",
        bookId: "book-1",
        kind: "sample-generation",
        narratorId: "marlowe",
        mode: "classic",
      }),
    ]);
    const generationHistory = listGenerationOutputHistoryForBook(
      "workspace-jobs",
      "book-1",
      10,
    );
    expect(generationHistory).toHaveLength(3);
    expect(generationHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: queuedFullBookJob?.id,
          kind: "full-book-generation",
        }),
        expect.objectContaining({
          jobId: queuedSecondSampleJob?.id,
          kind: "sample-generation",
          narratorId: "marlowe",
          mode: "classic",
        }),
        expect.objectContaining({
          jobId: queuedJob?.id,
          kind: "sample-generation",
          narratorId: "sloane",
          mode: "immersive",
        }),
      ]),
    );
    expect(getGenerationArtifactForJob(queuedSecondSampleJob?.id ?? "", "workspace-jobs"))
      .toEqual(
        expect.objectContaining({
          jobId: queuedSecondSampleJob?.id,
          kind: "sample-generation",
          narratorId: "marlowe",
          mode: "classic",
        }),
      );
    expect(getWorkspaceSyncSummary("workspace-jobs")?.generatedOutputCount).toBe(2);
  });

  it("can fail a running generation job", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const queuedJob = enqueueGenerationJob({
      workspaceId: "workspace-failure",
      kind: "sample-generation",
      bookId: "book-failure",
      narratorId: "marlowe",
      mode: "ambient",
    });

    const runningJob = claimNextGenerationJob();
    expect(runningJob?.id).toBe(queuedJob?.id);
    expect(runningJob?.status).toBe("running");

    const failedJob = failGenerationJob(
      queuedJob?.id ?? "",
      "workspace-failure",
      "Sample provider timed out.",
    );
    expect(failedJob?.status).toBe("failed");
    expect(failedJob?.errorMessage).toBe("Sample provider timed out.");
    expect(getGenerationJob(queuedJob?.id ?? "", "workspace-failure")?.status).toBe(
      "failed",
    );
  });

  it("can retry a failed generation job", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const queuedJob = enqueueGenerationJob({
      workspaceId: "workspace-retry",
      kind: "full-book-generation",
      bookId: "book-retry",
      narratorId: null,
      mode: null,
      chapterCount: 4,
    });

    claimNextGenerationJob();
    failGenerationJob(queuedJob?.id ?? "", "workspace-retry");

    const retriedJob = retryGenerationJob(queuedJob?.id ?? "", "workspace-retry");
    expect(retriedJob).toMatchObject({
      workspaceId: "workspace-retry",
      kind: "full-book-generation",
      status: "queued",
      bookId: "book-retry",
      chapterCount: 4,
    });
    expect(retriedJob?.id).not.toBe(queuedJob?.id);
  });
});
