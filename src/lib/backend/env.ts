import path from "node:path";
import { tmpdir } from "node:os";

const developmentSessionSecret = "adaptive-audio-player-dev-session-secret";

function readOptionalStringEnv(name: string) {
  const value = process.env[name];
  if (value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readPositiveNumberEnv(name: string, fallback: number) {
  const rawValue = process.env[name];
  if (rawValue === undefined || !rawValue.trim()) {
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }

  return parsed;
}

export function getDatabasePath() {
  return (
    readOptionalStringEnv("ADAPTIVE_AUDIO_PLAYER_DB_PATH") ??
    path.join(getDataRoot(), "adaptive-audio-player.sqlite")
  );
}

export function getDataRoot() {
  return (
    readOptionalStringEnv("ADAPTIVE_AUDIO_PLAYER_DATA_ROOT") ??
    (process.env.VERCEL ? path.join(tmpdir(), "adaptive-audio-player") : path.join(process.cwd(), "data"))
  );
}

export function getSessionSecret() {
  const configuredSecret = readOptionalStringEnv(
    "ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET",
  );

  if (configuredSecret) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET must be set in production.",
    );
  }

  return developmentSessionSecret;
}

export function getOpenAIApiKey() {
  return readOptionalStringEnv("OPENAI_API_KEY");
}

export function getWorkerConfig() {
  return {
    pollMs: readPositiveNumberEnv("ADAPTIVE_AUDIO_PLAYER_WORKER_POLL_MS", 150),
    sampleJobDurationMs: readPositiveNumberEnv(
      "ADAPTIVE_AUDIO_PLAYER_SAMPLE_JOB_DURATION_MS",
      350,
    ),
    fullBookJobDurationMs: readPositiveNumberEnv(
      "ADAPTIVE_AUDIO_PLAYER_FULL_BOOK_JOB_DURATION_MS",
      550,
    ),
  };
}
