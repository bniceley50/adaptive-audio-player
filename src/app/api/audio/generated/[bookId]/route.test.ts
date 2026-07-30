import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/audio/generated/[bookId]/route";
import { writeGeneratedAudioAsset } from "@/lib/backend/audio-storage";
import {
  claimNextGenerationJob,
  completeGenerationJob,
  enqueueGenerationJob,
  getDatabase,
  resetDatabaseForTests,
} from "@/lib/backend/sqlite";
import { createSignedWorkspaceCookieValue } from "@/lib/backend/workspace-session";

type GenerationKind = "full-book-generation" | "sample-generation";

describe("generated audio route", () => {
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
      path.join(process.cwd(), ".adaptive-audio-route-"),
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

  function recordOutput(input: {
    assetPath?: string;
    bookId?: string;
    data?: Buffer;
    kind?: GenerationKind;
    workspaceId?: string;
  }) {
    const workspaceId = input.workspaceId ?? "workspace-audio";
    const bookId = input.bookId ?? "book-1";
    const kind = input.kind ?? "sample-generation";
    const data = input.data ?? Buffer.from("RIFFmock-audio");
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

    return data;
  }

  function setupOutput(input: {
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
    return recordOutput({ ...input, bookId, workspaceId });
  }

  async function requestAudio(input: {
    accountCookieValue?: string;
    bookId?: string;
    kind?: GenerationKind;
    range?: string;
    workspaceId?: string;
  } = {}) {
    const bookId = input.bookId ?? "book-1";
    const kind = input.kind ?? "sample-generation";
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
        `http://localhost/api/audio/generated/${bookId}?kind=${kind}`,
        { headers },
      ),
      { params: Promise.resolve({ bookId }) },
    );
  }

  it("streams the complete generated file for the active workspace", async () => {
    const data = setupOutput();

    const response = await requestAudio({ workspaceId: "workspace-audio" });

    expect(response.status).toBe(200);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-length")).toBe(String(data.length));
    expect(response.headers.get("content-type")).toBe("audio/wav");
    expect(Buffer.from(await response.arrayBuffer()).equals(data)).toBe(true);
  });

  it("streams only the requested byte range", async () => {
    const data = setupOutput();

    const response = await requestAudio({
      range: "bytes=0-3",
      workspaceId: "workspace-audio",
    });

    expect(response.status).toBe(206);
    expect(response.headers.get("content-length")).toBe("4");
    expect(response.headers.get("content-range")).toBe(
      `bytes 0-3/${data.length}`,
    );
    await expect(response.text()).resolves.toBe("RIFF");
  });

  it("returns 416 for an unsatisfiable byte range", async () => {
    const data = setupOutput();

    const response = await requestAudio({
      range: "bytes=100-200",
      workspaceId: "workspace-audio",
    });

    expect(response.status).toBe(416);
    expect(response.headers.get("content-length")).toBe("0");
    expect(response.headers.get("content-range")).toBe(`bytes */${data.length}`);
    await expect(response.arrayBuffer()).resolves.toHaveProperty("byteLength", 0);
  });

  it("requires an active workspace", async () => {
    const response = await requestAudio();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "No workspace is active.",
    });
  });

  it("does not reveal an output owned by another workspace", async () => {
    setupOutput();

    const response = await requestAudio({ workspaceId: "workspace-other" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Audio output not found.",
    });
  });

  it("returns 404 when the asset file is missing", async () => {
    setupOutput({
      assetPath: "generated/demo/book-1/sample-generation.wav",
    });

    const response = await requestAudio({
      workspaceId: "workspace-audio",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Audio asset is missing.",
    });
  });

  it("rejects an absolute stored path even when it points inside the generated root", async () => {
    configureTestDatabase();
    seedStoredBook("workspace-audio");
    const asset = writeGeneratedAudioAsset({
      bookId: "book-1",
      data: Buffer.from("RIFFprivate-audio"),
      extension: "wav",
      kind: "sample-generation",
      workspaceId: "workspace-audio",
    });
    recordOutput({ assetPath: asset.absolutePath });

    const response = await requestAudio({ workspaceId: "workspace-audio" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Audio asset is missing.",
    });
  });

  it("rejects a stored traversal path that escapes the generated root", async () => {
    configureTestDatabase();
    seedStoredBook("workspace-audio");
    const testRoot = createdDirectories.at(-1);
    if (!testRoot) {
      throw new Error("Expected a test data root fixture.");
    }

    const outsidePath = path.join(testRoot, "outside.wav");
    writeFileSync(outsidePath, "RIFFoutside-audio");
    const traversalPath = [
      path.relative(process.cwd(), path.join(testRoot, "generated-audio")),
      "..",
      "outside.wav",
    ].join(path.sep);
    expect(path.isAbsolute(traversalPath)).toBe(false);
    expect(traversalPath).toContain(`..${path.sep}`);
    recordOutput({ assetPath: traversalPath });

    const response = await requestAudio({ workspaceId: "workspace-audio" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Audio asset is missing.",
    });
  });

  it("streams full-book audio without requiring a legacy account session", async () => {
    const data = setupOutput({ kind: "full-book-generation" });

    const response = await requestAudio({
      accountCookieValue: "stale-legacy-session",
      kind: "full-book-generation",
      workspaceId: "workspace-audio",
    });

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(data)).toBe(true);
  });
});
