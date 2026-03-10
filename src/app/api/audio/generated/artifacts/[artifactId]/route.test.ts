import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/audio/generated/artifacts/[artifactId]/route";
import {
  completeGenerationJob,
  createAccountSession,
  enqueueGenerationJob,
  linkWorkspaceToUser,
  listAccountSessionsForUser,
  listGenerationOutputHistoryForBook,
  resetDatabaseForTests,
  syncWorkspaceLibrarySnapshot,
  upsertUserByEmail,
} from "@/lib/backend/sqlite";
import { writeGeneratedAudioAsset } from "@/lib/backend/audio-storage";
import {
  createSignedAccountSession,
  createSignedWorkspaceCookieValue,
} from "@/lib/backend/workspace-session";

describe("generated artifact audio route", () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    resetDatabaseForTests();

    for (const dir of createdDirs.splice(0, createdDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }

    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
  });

  it("streams a preserved generated artifact for the active workspace", async () => {
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
      data: Buffer.from("RIFFhistorical-audio"),
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

    const historyArtifactId =
      listGenerationOutputHistoryForBook("workspace-audio", "book-1", 1)[0]?.id ??
      (() => {
        throw new Error("artifact id was not created");
      })();

    const response = await GET(
      new Request(
        `http://localhost/api/audio/generated/artifacts/${historyArtifactId}`,
        {
          headers: {
            cookie: `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue("workspace-audio")}`,
          },
        },
      ),
      { params: Promise.resolve({ artifactId: historyArtifactId }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/wav");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString()).toBe(
      "RIFF",
    );
  });

  it("updates the signed-in session with archived render activity", async () => {
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
      kind: "sample-generation",
      extension: "wav",
      data: Buffer.from("RIFFhistorical-audio"),
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

    const artifactId =
      listGenerationOutputHistoryForBook("workspace-audio", "book-1", 1)[0]?.id ??
      (() => {
        throw new Error("artifact id was not created");
      })();

    const response = await GET(
      new Request(
        `http://localhost/api/audio/generated/artifacts/${artifactId}`,
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
      { params: Promise.resolve({ artifactId }) },
    );

    expect(response.status).toBe(200);

    const sessions = listAccountSessionsForUser(owner.id, ownerSession?.id ?? null, 5);
    expect(sessions[0]).toMatchObject({
      id: ownerSession?.id,
      lastActivityLabel: "Listening to Storm Harbor (archived sample)",
      lastActivityPath: `/player/book-1?artifactId=${artifactId}&artifactKind=sample-generation&renderState=archived`,
    });
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

    const asset = writeGeneratedAudioAsset({
      workspaceId: "workspace-audio",
      bookId: "book-1",
      kind: "sample-generation",
      extension: "wav",
      data: Buffer.from("RIFFhistorical-audio"),
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

    const artifactId =
      listGenerationOutputHistoryForBook("workspace-audio", "book-1", 1)[0]?.id ??
      "missing";

    const response = await GET(
      new Request(
        `http://localhost/api/audio/generated/artifacts/${artifactId}`,
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
      { params: Promise.resolve({ artifactId }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "This workspace belongs to another account.",
    });
  });
});
