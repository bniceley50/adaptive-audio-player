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

function readAbsolutePathEnv(name: string) {
  const value = readOptionalStringEnv(name);
  if (value === null) {
    return null;
  }
  if (!path.isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path.`);
  }
  return path.normalize(value);
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
    readAbsolutePathEnv("ADAPTIVE_AUDIO_PLAYER_DB_PATH") ??
    path.join(getDataRoot(), "database", "adaptive-audio-player.sqlite")
  );
}

export function getDataRoot() {
  const configuredRoot = readAbsolutePathEnv(
    "ADAPTIVE_AUDIO_PLAYER_DATA_ROOT",
  );
  if (configuredRoot) {
    return configuredRoot;
  }
  if (process.env.VERCEL) {
    return path.join(tmpdir(), "adaptive-audio-player");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ADAPTIVE_AUDIO_PLAYER_DATA_ROOT must be an absolute host-owned path in production.",
    );
  }
  return path.join(process.cwd(), "data");
}

export function getChatterboxRuntimeRoot() {
  return (
    readAbsolutePathEnv("ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_ROOT") ??
    path.join(getDataRoot(), "local-chatterbox")
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

function isLoopbackTtsHost(hostname: string) {
  const normalizedHostname = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    normalizedHostname === "localhost" ||
    normalizedHostname === "::1" ||
    normalizedHostname.startsWith("127.")
  );
}

function readLoopbackServiceUrl(name: string, fallback?: string) {
  const rawUrl = readOptionalStringEnv(name) ?? fallback ?? null;
  if (rawUrl === null) {
    return null;
  }
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }

  if (parsedUrl.protocol !== "http:" || !isLoopbackTtsHost(parsedUrl.hostname)) {
    throw new Error(`${name} must be an http:// localhost URL.`);
  }

  return parsedUrl.origin;
}

function readLocalServiceSecret(name: string, requiredInProduction: boolean) {
  const secret = readOptionalStringEnv(name);
  if (secret !== null && !/^[a-f0-9]{64}$/i.test(secret)) {
    throw new Error(
      `${name} must contain 256 bits encoded as 64 hexadecimal characters.`,
    );
  }
  if (secret === null && requiredInProduction && process.env.NODE_ENV === "production") {
    throw new Error(`${name} must be set in production.`);
  }
  return secret;
}

export function getLocalTtsConfig() {
  const url = readLoopbackServiceUrl(
    "ADAPTIVE_AUDIO_PLAYER_TTS_URL",
    "http://127.0.0.1:8765",
  );
  const secret = readLocalServiceSecret(
    "ADAPTIVE_AUDIO_PLAYER_TTS_SECRET",
    true,
  );

  return {
    url: url ?? "http://127.0.0.1:8765",
    secret,
    timeoutMs: readPositiveNumberEnv(
      "ADAPTIVE_AUDIO_PLAYER_TTS_TIMEOUT_MS",
      180_000,
    ),
  };
}

export function getLocalChatterboxConfig() {
  const url = readLoopbackServiceUrl(
    "ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_URL",
  );
  if (url === null) {
    return null;
  }
  const secret = readLocalServiceSecret(
    "ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_SECRET",
    true,
  );
  if (secret === null) {
    throw new Error(
      "ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_SECRET is required when High Quality narration is configured.",
    );
  }

  return {
    url,
    secret,
    timeoutMs: readPositiveNumberEnv(
      "ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_TIMEOUT_MS",
      300_000,
    ),
  };
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
