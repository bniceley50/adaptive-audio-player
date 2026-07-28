import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/audio/generated/artifacts/[artifactId]/route";
import { writeGeneratedAudioAsset } from "@/lib/backend/audio-storage";
import {
  claimNextGenerationJob,
  completeGenerationJob,
  enqueueGenerationJob,
  getDatabase,
  listGenerationOutputHistoryForBook,
  resetDatabaseForTests,
} from "@/lib/backend/sqlite";
import { createSignedWorkspaceCookieValue } from "@/lib/backend/workspace-session";

type GenerationKind = "full-book-generation" | "sample-generation";

describe("generated artifact audio route", () => {
  const createdDirectories: string[] = [];

  afterEach(() => {
    resetDatabaseForTests();

    for (const directory of createdDirectories.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }

    delete process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT;
    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
  });

  function configureTestDatabase() {
    const directory = mkdtempSync(
      path.join(process.cwd(), ".adaptive-artifact-route-"),
    );
    createdDirectories.push(directory);
    process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT = directory;
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(
      directory,
      "library.sqlite",
    );
  }

  function seedStoredBook(
    workspaceId: string,
    bookId = "book-1",
    title = "Storm Harbor",
  ) {
    const database = getDatabase();
    const timestamp = "2026-03-08T12:00:00.000Z";
    database
      .prepare(
        `
          insert into workspaces (id, created_at, updated_at, last_synced_at)
          values (?, ?, ?, null)
        `,
      )
      .run(workspaceId, timestamp, timestamp);
    database
      .prepare(
        `
          insert into synced_books (
            workspace_id, book_id, title, chapter_count, updated_at, draft_text
          ) values (?, ?, ?, 2, ?, ?)
        `,
      )
      .run(workspaceId, bookId, title, timestamp, `Chapter 1\n${title}`);
  }

  function recordArtifact(input: {
    assetPath?: string;
    bookId?: string;
    data?: Buffer;
    kind?: GenerationKind;
    workspaceId?: string;
  }) {
    const workspaceId = input.workspaceId ?? "workspace-audio";
    const bookId = input.bookId ?? "book-1";
    const kind = input.kind ?? "sample-generation";
    const data = input.data ?? Buffer.from("RIFFhistorical-audio");
    const assetPath =
      input.assetPath ??
      writeGeneratedAudioAsset({
        bookId,
        data,
        extension: "wav",
        kind,
        workspaceId,
      }).relativePath;
    const job = enqueueGenerationJob({
      bookId,
      kind,
      mode: "narration",
      narratorId: "sloane",
      workspaceId,
    });
    if (!job) {
      throw new Error("Expected a generation job fixture.");
    }

    const claimedJob = claimNextGenerationJob();
    if (claimedJob?.id !== job.id) {
      throw new Error("Expected the generation job fixture to be running.");
    }

    const completion = completeGenerationJob(job.id, workspaceId, {
      assetPath,
      mimeType: "audio/wav",
      provider: "mock",
    });
    if (!completion.ok) {
      throw new Error("Expected the generation job fixture to complete.");
    }

    const artifact = listGenerationOutputHistoryForBook(
      workspaceId,
      bookId,
      1,
    )[0];
    if (!artifact) {
      throw new Error("Expected a generation artifact fixture.");
    }

    return { artifactId: artifact.id, data };
  }

  function setupArtifact(input: {
    assetPath?: string;
    bookId?: string;
    data?: Buffer;
    kind?: GenerationKind;
    title?: string;
    workspaceId?: string;
  } = {}) {
    const workspaceId = input.workspaceId ?? "workspace-audio";
    const bookId = input.bookId ?? "book-1";
    configureTestDatabase();
    seedStoredBook(workspaceId, bookId, input.title);
    return recordArtifact({ ...input, bookId, workspaceId });
  }

  async function requestArtifact(input: {
    accountCookieValue?: string;
    artifactId: string;
    range?: string;
    workspaceId?: string;
  }) {
    const headers = new Headers();
    const cookies: string[] = [];

    if (input.workspaceId) {
      cookies.push(
        `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue(input.workspaceId)}`,
      );
    }
    if (input.accountCookieValue) {
      cookies.push(
        `adaptive-audio-player.account=${input.accountCookieValue}`,
      );
    }
    if (cookies.length > 0) {
      headers.set("cookie", cookies.join("; "));
    }
    if (input.range) {
      headers.set("range", input.range);
    }

    return GET(
      new Request(
        `http://localhost/api/audio/generated/artifacts/${input.artifactId}`,
        { headers },
      ),
      { params: Promise.resolve({ artifactId: input.artifactId }) },
    );
  }

  it("streams the complete archived artifact for the active workspace", async () => {
    const { artifactId, data } = setupArtifact();

    const response = await requestArtifact({
      artifactId,
      workspaceId: "workspace-audio",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-length")).toBe(String(data.length));
    expect(response.headers.get("content-type")).toBe("audio/wav");
    expect(Buffer.from(await response.arrayBuffer()).equals(data)).toBe(true);
  });

  it("streams only the requested bytes from an archived artifact", async () => {
    const { artifactId, data } = setupArtifact();

    const response = await requestArtifact({
      artifactId,
      range: "bytes=4-13",
      workspaceId: "workspace-audio",
    });

    expect(response.status).toBe(206);
    expect(response.headers.get("content-length")).toBe("10");
    expect(response.headers.get("content-range")).toBe(
      `bytes 4-13/${data.length}`,
    );
    await expect(response.text()).resolves.toBe("historical");
  });

  it("returns 416 for an unsatisfiable archived-artifact range", async () => {
    const { artifactId, data } = setupArtifact();

    const response = await requestArtifact({
      artifactId,
      range: "bytes=100-200",
      workspaceId: "workspace-audio",
    });

    expect(response.status).toBe(416);
    expect(response.headers.get("content-length")).toBe("0");
    expect(response.headers.get("content-range")).toBe(`bytes */${data.length}`);
    await expect(response.arrayBuffer()).resolves.toHaveProperty("byteLength", 0);
  });

  it("requires an active workspace before resolving an artifact", async () => {
    const response = await requestArtifact({ artifactId: "secret-artifact-id" });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "No workspace is active.",
    });
  });

  it("returns the same generic 404 for an invalid artifact ID", async () => {
    setupArtifact();

    const response = await requestArtifact({
      artifactId: "invalid-artifact-id",
      workspaceId: "workspace-audio",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Audio artifact not found.",
    });
  });

  it("does not expose another workspace's artifact metadata", async () => {
    const { artifactId } = setupArtifact();

    const response = await requestArtifact({
      artifactId,
      workspaceId: "workspace-other",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Audio artifact not found.",
    });
  });

  it("returns 404 when the artifact file is missing", async () => {
    const { artifactId } = setupArtifact({
      assetPath: "generated/demo/book-1/archived-sample.wav",
    });

    const response = await requestArtifact({
      artifactId,
      workspaceId: "workspace-audio",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Audio artifact is missing.",
    });
  });

  it("rejects an archived absolute path even when it points inside the generated root", async () => {
    configureTestDatabase();
    seedStoredBook("workspace-audio");
    const asset = writeGeneratedAudioAsset({
      bookId: "book-1",
      data: Buffer.from("RIFFprivate-archive"),
      extension: "wav",
      kind: "sample-generation",
      workspaceId: "workspace-audio",
    });
    const { artifactId } = recordArtifact({ assetPath: asset.absolutePath });

    const response = await requestArtifact({
      artifactId,
      workspaceId: "workspace-audio",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Audio artifact is missing.",
    });
  });

  it("rejects an archived traversal path that escapes the generated root", async () => {
    configureTestDatabase();
    seedStoredBook("workspace-audio");
    const testRoot = createdDirectories.at(-1);
    if (!testRoot) {
      throw new Error("Expected a test data root fixture.");
    }

    const outsidePath = path.join(testRoot, "outside.wav");
    writeFileSync(outsidePath, "RIFFoutside-archive");
    const traversalPath = [
      path.relative(process.cwd(), path.join(testRoot, "generated-audio")),
      "..",
      "outside.wav",
    ].join(path.sep);
    expect(path.isAbsolute(traversalPath)).toBe(false);
    expect(traversalPath).toContain(`..${path.sep}`);
    const { artifactId } = recordArtifact({ assetPath: traversalPath });

    const response = await requestArtifact({
      artifactId,
      workspaceId: "workspace-audio",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Audio artifact is missing.",
    });
  });

  it("streams a full-book artifact without requiring a legacy account session", async () => {
    const { artifactId, data } = setupArtifact({ kind: "full-book-generation" });

    const response = await requestArtifact({
      accountCookieValue: "stale-legacy-session",
      artifactId,
      workspaceId: "workspace-audio",
    });

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(data)).toBe(true);
  });
});
