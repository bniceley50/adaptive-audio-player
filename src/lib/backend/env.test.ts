import { afterEach, describe, expect, it } from "vitest";

import {
  getDatabasePath,
  getLocalTtsConfig,
  getSessionSecret,
  getWorkerConfig,
} from "@/lib/backend/env";

const originalNodeEnv = process.env.NODE_ENV;
const originalDbPath = process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
const originalSessionSecret = process.env.ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET;
const originalTtsUrl = process.env.ADAPTIVE_AUDIO_PLAYER_TTS_URL;
const originalTtsTimeoutMs = process.env.ADAPTIVE_AUDIO_PLAYER_TTS_TIMEOUT_MS;
const originalPollMs = process.env.ADAPTIVE_AUDIO_PLAYER_WORKER_POLL_MS;
const originalSampleDuration =
  process.env.ADAPTIVE_AUDIO_PLAYER_SAMPLE_JOB_DURATION_MS;
const originalFullBookDuration =
  process.env.ADAPTIVE_AUDIO_PLAYER_FULL_BOOK_JOB_DURATION_MS;

afterEach(() => {
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
});

describe("backend env helpers", () => {
  it("uses development defaults locally", () => {
    delete process.env.ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET;
    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";

    expect(getSessionSecret()).toBe("adaptive-audio-player-dev-session-secret");
    expect(getDatabasePath()).toContain("adaptive-audio-player.sqlite");
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
    delete process.env.ADAPTIVE_AUDIO_PLAYER_TTS_TIMEOUT_MS;

    expect(getLocalTtsConfig()).toEqual({
      url: "http://127.0.0.1:8765",
      timeoutMs: 180_000,
    });
  });

  it("accepts only localhost TTS sidecar URLs", () => {
    process.env.ADAPTIVE_AUDIO_PLAYER_TTS_URL = " http://localhost:8766/custom ";
    process.env.ADAPTIVE_AUDIO_PLAYER_TTS_TIMEOUT_MS = "2500";

    expect(getLocalTtsConfig()).toEqual({
      url: "http://localhost:8766",
      timeoutMs: 2500,
    });

    process.env.ADAPTIVE_AUDIO_PLAYER_TTS_URL = "https://api.openai.com";

    expect(() => getLocalTtsConfig()).toThrow(
      "ADAPTIVE_AUDIO_PLAYER_TTS_URL must be an http:// localhost URL.",
    );
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
