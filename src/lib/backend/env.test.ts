import { afterEach, describe, expect, it } from "vitest";

import {
  getDatabasePath,
  getOpenAIApiKey,
  getSessionSecret,
  getWorkerConfig,
} from "@/lib/backend/env";

const originalNodeEnv = process.env.NODE_ENV;
const originalDbPath = process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
const originalSessionSecret = process.env.ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET;
const originalOpenAiKey = process.env.OPENAI_API_KEY;
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

  if (originalOpenAiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
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

  it("returns a trimmed OpenAI key when present", () => {
    process.env.OPENAI_API_KEY = "  test-key  ";

    expect(getOpenAIApiKey()).toBe("test-key");
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
