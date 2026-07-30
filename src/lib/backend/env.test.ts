import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { writeGeneratedAudioAsset } from "@/lib/backend/audio-storage";
import {
  getDatabase,
  resetDatabaseForTests,
} from "@/lib/backend/database";
import {
  getDataRoot,
  getDatabasePath,
  getLocalTtsConfig,
  getSessionSecret,
  getWorkerConfig,
} from "@/lib/backend/env";

const originalNodeEnv = process.env.NODE_ENV;
const originalDataRoot = process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT;
const originalDbPath = process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
const originalVercel = process.env.VERCEL;
const originalSessionSecret = process.env.ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET;
const originalTtsUrl = process.env.ADAPTIVE_AUDIO_PLAYER_TTS_URL;
const originalTtsSecret = process.env.ADAPTIVE_AUDIO_PLAYER_TTS_SECRET;
const originalTtsTimeoutMs = process.env.ADAPTIVE_AUDIO_PLAYER_TTS_TIMEOUT_MS;
const originalPollMs = process.env.ADAPTIVE_AUDIO_PLAYER_WORKER_POLL_MS;
const originalSampleDuration =
  process.env.ADAPTIVE_AUDIO_PLAYER_SAMPLE_JOB_DURATION_MS;
const originalFullBookDuration =
  process.env.ADAPTIVE_AUDIO_PLAYER_FULL_BOOK_JOB_DURATION_MS;
const temporaryRoots: string[] = [];

afterEach(() => {
  resetDatabaseForTests();
  vi.restoreAllMocks();
  const mutableEnv = process.env as Record<string, string | undefined>;

  if (originalNodeEnv === undefined) {
    delete mutableEnv.NODE_ENV;
  } else {
    mutableEnv.NODE_ENV = originalNodeEnv;
  }

  if (originalDbPath === undefined) {
    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
  } else {
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = originalDbPath;
  }

  if (originalDataRoot === undefined) {
    delete process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT;
  } else {
    process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT = originalDataRoot;
  }

  if (originalVercel === undefined) {
    delete process.env.VERCEL;
  } else {
    process.env.VERCEL = originalVercel;
  }

  if (originalSessionSecret === undefined) {
    delete process.env.ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET;
  } else {
    process.env.ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET = originalSessionSecret;
  }

  if (originalTtsUrl === undefined) {
    delete process.env.ADAPTIVE_AUDIO_PLAYER_TTS_URL;
  } else {
    process.env.ADAPTIVE_AUDIO_PLAYER_TTS_URL = originalTtsUrl;
  }

  if (originalTtsSecret === undefined) {
    delete process.env.ADAPTIVE_AUDIO_PLAYER_TTS_SECRET;
  } else {
    process.env.ADAPTIVE_AUDIO_PLAYER_TTS_SECRET = originalTtsSecret;
  }

  if (originalTtsTimeoutMs === undefined) {
    delete process.env.ADAPTIVE_AUDIO_PLAYER_TTS_TIMEOUT_MS;
  } else {
    process.env.ADAPTIVE_AUDIO_PLAYER_TTS_TIMEOUT_MS = originalTtsTimeoutMs;
  }

  if (originalPollMs === undefined) {
    delete process.env.ADAPTIVE_AUDIO_PLAYER_WORKER_POLL_MS;
  } else {
    process.env.ADAPTIVE_AUDIO_PLAYER_WORKER_POLL_MS = originalPollMs;
  }

  if (originalSampleDuration === undefined) {
    delete process.env.ADAPTIVE_AUDIO_PLAYER_SAMPLE_JOB_DURATION_MS;
  } else {
    process.env.ADAPTIVE_AUDIO_PLAYER_SAMPLE_JOB_DURATION_MS =
      originalSampleDuration;
  }

  if (originalFullBookDuration === undefined) {
    delete process.env.ADAPTIVE_AUDIO_PLAYER_FULL_BOOK_JOB_DURATION_MS;
  } else {
    process.env.ADAPTIVE_AUDIO_PLAYER_FULL_BOOK_JOB_DURATION_MS =
      originalFullBookDuration;
  }

  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("backend env helpers", () => {
  it("uses development defaults locally", () => {
    delete process.env.ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET;
    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
    delete process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT;
    delete process.env.VERCEL;
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";

    expect(getSessionSecret()).toBe("adaptive-audio-player-dev-session-secret");
    expect(getDatabasePath()).toContain("adaptive-audio-player.sqlite");
  });

  it("fails closed without an absolute production data root", () => {
    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
    delete process.env.VERCEL;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT = "relative-data";

    expect(() => getDataRoot()).toThrow(
      "ADAPTIVE_AUDIO_PLAYER_DATA_ROOT must be an absolute path.",
    );

    delete process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT;
    expect(() => getDataRoot()).toThrow(
      "ADAPTIVE_AUDIO_PLAYER_DATA_ROOT must be an absolute host-owned path in production.",
    );

    process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT = path.join(
      tmpdir(),
      "adaptive-audio-player",
    );
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = "relative.sqlite";
    expect(() => getDatabasePath()).toThrow(
      "ADAPTIVE_AUDIO_PLAYER_DB_PATH must be an absolute path.",
    );
  });

  it("keeps production database and generated audio writes out of the package cwd", () => {
    const proofRoot = mkdtempSync(
      path.join(tmpdir(), "adaptive-node-app-data-proof-"),
    );
    temporaryRoots.push(proofRoot);
    const packageRoot = path.join(proofRoot, "read-only-package");
    const dataRoot = path.join(proofRoot, "Brían app data");
    mkdirSync(packageRoot);
    vi.spyOn(process, "cwd").mockReturnValue(packageRoot);
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT = dataRoot;
    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
    delete process.env.VERCEL;

    getDatabase().prepare("select 1").get();
    const stored = writeGeneratedAudioAsset({
      workspaceId: "workspace-1",
      bookId: "book-1",
      kind: "sample-generation",
      extension: "wav",
      data: Buffer.from("audio"),
    });

    expect(getDataRoot()).toBe(dataRoot);
    expect(getDatabasePath()).toBe(
      path.join(dataRoot, "database", "adaptive-audio-player.sqlite"),
    );
    expect(existsSync(getDatabasePath())).toBe(true);
    expect(stored.absolutePath.startsWith(`${dataRoot}${path.sep}`)).toBe(true);
    expect(existsSync(stored.absolutePath)).toBe(true);
    expect(readdirSync(packageRoot)).toEqual([]);
  });

  it("requires a session secret in production", () => {
    delete process.env.ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";

    expect(() => getSessionSecret()).toThrow(
      "ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET must be set in production.",
    );
  });

  it("defaults the local TTS sidecar to localhost", () => {
    delete process.env.ADAPTIVE_AUDIO_PLAYER_TTS_URL;
    delete process.env.ADAPTIVE_AUDIO_PLAYER_TTS_SECRET;
    delete process.env.ADAPTIVE_AUDIO_PLAYER_TTS_TIMEOUT_MS;

    expect(getLocalTtsConfig()).toEqual({
      url: "http://127.0.0.1:8765",
      secret: null,
      timeoutMs: 180_000,
    });
  });

  it("accepts only localhost TTS sidecar URLs", () => {
    process.env.ADAPTIVE_AUDIO_PLAYER_TTS_URL = " http://localhost:8766/custom ";
    process.env.ADAPTIVE_AUDIO_PLAYER_TTS_SECRET = "a".repeat(64);
    process.env.ADAPTIVE_AUDIO_PLAYER_TTS_TIMEOUT_MS = "2500";

    expect(getLocalTtsConfig()).toEqual({
      url: "http://localhost:8766",
      secret: "a".repeat(64),
      timeoutMs: 2500,
    });

    process.env.ADAPTIVE_AUDIO_PLAYER_TTS_URL = "https://api.openai.com";

    expect(() => getLocalTtsConfig()).toThrow(
      "ADAPTIVE_AUDIO_PLAYER_TTS_URL must be an http:// localhost URL.",
    );
  });

  it("requires a valid independent TTS secret in production", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.ADAPTIVE_AUDIO_PLAYER_TTS_SECRET;

    expect(() => getLocalTtsConfig()).toThrow(
      "ADAPTIVE_AUDIO_PLAYER_TTS_SECRET must be set in production.",
    );

    process.env.ADAPTIVE_AUDIO_PLAYER_TTS_SECRET = "weak-secret";
    expect(() => getLocalTtsConfig()).toThrow("must contain 256 bits");

    process.env.ADAPTIVE_AUDIO_PLAYER_TTS_SECRET = "b".repeat(64);
    expect(getLocalTtsConfig().secret).toBe("b".repeat(64));
  });

  it("validates positive worker durations", () => {
    process.env.ADAPTIVE_AUDIO_PLAYER_WORKER_POLL_MS = "150";
    process.env.ADAPTIVE_AUDIO_PLAYER_SAMPLE_JOB_DURATION_MS = "350";
    process.env.ADAPTIVE_AUDIO_PLAYER_FULL_BOOK_JOB_DURATION_MS = "0";

    expect(() => getWorkerConfig()).toThrow(
      "ADAPTIVE_AUDIO_PLAYER_FULL_BOOK_JOB_DURATION_MS must be a positive number.",
    );
  });
});
