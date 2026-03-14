import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/audio/generated/[bookId]/route";
import {
  createAccountSession,
  completeGenerationJob,
  enqueueGenerationJob,
    linkWorkspaceToUser,
  listAccountSessionsForUser,
  resetDatabaseForTests,
  syncWorkspaceLibrarySnapshot,
  upsertUserByEmail,
} from "@/lib/backend/sqlite";
import { writeGeneratedAudioAsset } from "@/lib/backend/audio-storage";
import {
  createSignedAccountSession,
  createSignedWorkspaceCookieValue,
} from "@/lib/backend/workspace-session";

describe("generated audio route", () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    resetDatabaseForTests();

    for (const dir of createdDirs.splice(0, createdDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }

    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
  });

  it("streams generated audio for the active workspace", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    syncWorkspaceLibrarySnapshot("workspace-audio", {
      libraryBooks: [
        {
          bookId: "book-1",
          title: "Storm Harbor",
          chapterCount: 2,
          updatedAt: "2026-03-08T12:00:00.000Z",
        },
      ],
      draftTexts: [{ bookId: "book-1", text: "Chapter 1\nStorm Harbor" }],
      listeningProfiles: [],
      defaultListeningProfile: null,
      sampleRequest: null,
      playbackStates: [],
      playbackDefaults: null,
      syncedAt: "2026-03-08T12:01:00.000Z",
    });

    const asset = writeGeneratedAudioAsset({
      workspaceId: "workspace-audio",
      bookId: "book-1",
      kind: "sample-generation",
      extension: "wav",
      data: Buffer.from("RIFFmock-audio"),
    });

    const job = enqueueGenerationJob({
      workspaceId: "workspace-audio",
      kind: "sample-generation",
      bookId: "book-1",
      narratorId: "sloane",
      mode: "immersive",
    });

    completeGenerationJob(job?.id ?? "", "workspace-audio", {
      assetPath: asset.relativePath,
      mimeType: "audio/wav",
      provider: "mock",
    });

    const response = await GET(
      new Request(
        "http://localhost/api/audio/generated/book-1?kind=sample-generation",
        {
          headers: {
            cookie: `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue("workspace-audio")}`,
          },
        },
      ),
      { params: Promise.resolve({ bookId: "book-1" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/wav");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString()).toBe(
      "RIFF",
    );
  });

  it("updates the signed-in session with listening activity", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    syncWorkspaceLibrarySnapshot("workspace-audio", {
      libraryBooks: [
        {
          bookId: "book-1",
          title: "Storm Harbor",
          chapterCount: 2,
          updatedAt: "2026-03-08T12:00:00.000Z",
        },
      ],
      draftTexts: [{ bookId: "book-1", text: "Chapter 1\nStorm Harbor" }],
      listeningProfiles: [],
      defaultListeningProfile: null,
      sampleRequest: null,
      playbackStates: [],
      playbackDefaults: null,
      syncedAt: "2026-03-08T12:01:00.000Z",
    });

    const owner = upsertUserByEmail({
      email: "owner@example.com",
      displayName: "Owner",
    });
    linkWorkspaceToUser("workspace-audio", owner.id);
    const ownerSession = createAccountSession(
      owner.id,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      "Safari on Mac",
    );

    const asset = writeGeneratedAudioAsset({
      workspaceId: "workspace-audio",
      bookId: "book-1",
      kind: "full-book-generation",
      extension: "wav",
      data: Buffer.from("RIFFmock-audio"),
    });

    const job = enqueueGenerationJob({
      workspaceId: "workspace-audio",
      kind: "full-book-generation",
      bookId: "book-1",
      narratorId: "sloane",
      mode: "immersive",
    });

    completeGenerationJob(job?.id ?? "", "workspace-audio", {
      assetPath: asset.relativePath,
      mimeType: "audio/wav",
      provider: "mock",
    });

    const response = await GET(
      new Request(
        "http://localhost/api/audio/generated/book-1?kind=full-book-generation",
        {
          headers: {
            cookie: [
              `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue("workspace-audio")}`,
              `adaptive-audio-player.account=${createSignedAccountSession(
                owner.id,
                ownerSession?.id ?? "",
              )}`,
            ].join("; "),
          },
        },
      ),
      { params: Promise.resolve({ bookId: "book-1" }) },
    );

    expect(response.status).toBe(200);

    const sessions = listAccountSessionsForUser(owner.id, ownerSession?.id ?? null, 5);
    expect(sessions[0]).toMatchObject({
      id: ownerSession?.id,
      lastActivityLabel: "Listening to Storm Harbor (full book)",
      lastActivityPath: "/player/book-1?artifact=full",
    });
  });

  it("falls back to deterministic demo audio when the synced asset path is a portfolio demo path", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    syncWorkspaceLibrarySnapshot("workspace-audio", {
      libraryBooks: [
        {
          bookId: "demo-book-1",
          title: "Harbor Lights",
          chapterCount: 3,
          updatedAt: "2026-03-08T12:00:00.000Z",
        },
      ],
      draftTexts: [{ bookId: "demo-book-1", text: "Chapter 1\nHarbor Lights" }],
      listeningProfiles: [],
      defaultListeningProfile: null,
      sampleRequest: null,
      playbackStates: [],
      playbackDefaults: null,
      syncedAt: "2026-03-08T12:01:00.000Z",
    });

    const job = enqueueGenerationJob({
      workspaceId: "workspace-audio",
      kind: "full-book-generation",
      bookId: "demo-book-1",
      narratorId: "sloane",
      mode: "immersive",
    });

    completeGenerationJob(job?.id ?? "", "workspace-audio", {
      assetPath: "generated/demo/demo-book-1/full-book-generation.wav",
      mimeType: "audio/wav",
      provider: "mock",
    });

    const response = await GET(
      new Request(
        "http://localhost/api/audio/generated/demo-book-1?kind=full-book-generation",
        {
          headers: {
            cookie: `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue("workspace-audio")}`,
          },
        },
      ),
      { params: Promise.resolve({ bookId: "demo-book-1" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/wav");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString()).toBe(
      "RIFF",
    );
  });

  it("rejects access when the signed-in account does not own the linked workspace", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    syncWorkspaceLibrarySnapshot("workspace-audio", {
      libraryBooks: [
        {
          bookId: "book-1",
          title: "Storm Harbor",
          chapterCount: 2,
          updatedAt: "2026-03-08T12:00:00.000Z",
        },
      ],
      draftTexts: [{ bookId: "book-1", text: "Chapter 1\nStorm Harbor" }],
      listeningProfiles: [],
      defaultListeningProfile: null,
      sampleRequest: null,
      playbackStates: [],
      playbackDefaults: null,
      syncedAt: "2026-03-08T12:01:00.000Z",
    });

    const owner = upsertUserByEmail({
      email: "owner@example.com",
      displayName: "Owner",
    });
    const intruder = upsertUserByEmail({
      email: "intruder@example.com",
      displayName: "Intruder",
    });
    linkWorkspaceToUser("workspace-audio", owner.id);

    const intruderSession = createAccountSession(
      intruder.id,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      "Test browser",
    );

    const response = await GET(
      new Request(
        "http://localhost/api/audio/generated/book-1?kind=sample-generation",
        {
          headers: {
            cookie: [
              `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue("workspace-audio")}`,
              `adaptive-audio-player.account=${createSignedAccountSession(
                intruder.id,
                intruderSession?.id ?? "",
              )}`,
            ].join("; "),
          },
        },
      ),
      { params: Promise.resolve({ bookId: "book-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "This workspace belongs to another account.",
    });
  });
});
