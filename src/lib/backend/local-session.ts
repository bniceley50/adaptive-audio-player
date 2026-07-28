import { timingSafeEqual } from "node:crypto";

export const localSessionCookieName =
  "adaptive_audio_player_local_session";
export const maxLocalRequestBytes = 6_500_000;

const secretPattern = /^[a-f0-9]{64}$/i;

export interface LocalSessionBoundaryConfig {
  origin: string;
  secret: string;
}

export type LocalSessionBoundaryResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "forbidden"
        | "invalid-request"
        | "request-too-large"
        | "unsupported-content-encoding";
      status: 400 | 403 | 413 | 415;
    };

function readOptionalEnvironmentValue(
  environment: Record<string, string | undefined>,
  name: string,
) {
  const value = environment[name]?.trim();
  return value || null;
}

function parsePackagedOrigin(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      "ADAPTIVE_AUDIO_PLAYER_APP_ORIGIN must be a valid loopback URL.",
    );
  }

  const port = Number(parsed.port);
  if (
    parsed.protocol !== "http:" ||
    parsed.hostname !== "127.0.0.1" ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65_535 ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "ADAPTIVE_AUDIO_PLAYER_APP_ORIGIN must be http://127.0.0.1:<unprivileged-port>.",
    );
  }

  return parsed.origin;
}

export function getLocalSessionBoundaryConfig(
  environment: Record<string, string | undefined> = process.env,
): LocalSessionBoundaryConfig | null {
  const rawOrigin = readOptionalEnvironmentValue(
    environment,
    "ADAPTIVE_AUDIO_PLAYER_APP_ORIGIN",
  );
  const secret = readOptionalEnvironmentValue(
    environment,
    "ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET",
  );

  if (!rawOrigin && !secret) {
    if (environment.NODE_ENV === "production") {
      throw new Error(
        "The packaged local-session boundary must be configured in production.",
      );
    }
    return null;
  }

  if (!rawOrigin || !secret) {
    throw new Error(
      "ADAPTIVE_AUDIO_PLAYER_APP_ORIGIN and ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET must be configured together.",
    );
  }
  if (!secretPattern.test(secret)) {
    throw new Error(
      "ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET must contain 256 bits encoded as 64 hexadecimal characters.",
    );
  }

  return {
    origin: parsePackagedOrigin(rawOrigin),
    secret,
  };
}

function readSingleCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return null;
  }

  let found = false;
  let value: string | null = null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) {
      continue;
    }
    if (found) {
      return null;
    }
    found = true;
    value = part.slice(separator + 1).trim();
  }

  return value;
}

function secretsMatch(actual: string | null, expected: string) {
  if (actual === null) {
    return false;
  }

  const actualBytes = Buffer.from(actual, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

function reject(
  code: Exclude<LocalSessionBoundaryResult, { ok: true }>["code"],
  status: Exclude<LocalSessionBoundaryResult, { ok: true }>["status"],
): LocalSessionBoundaryResult {
  return { ok: false, code, status };
}

export function verifyLocalSessionRequest(
  request: Request,
  config: LocalSessionBoundaryConfig,
): LocalSessionBoundaryResult {
  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return reject("invalid-request", 400);
  }

  const expectedUrl = new URL(config.origin);
  const expectedHost = expectedUrl.host;
  if (
    requestUrl.protocol !== expectedUrl.protocol ||
    requestUrl.port !== expectedUrl.port ||
    ![expectedUrl.hostname, "localhost"].includes(requestUrl.hostname) ||
    request.headers.get("host") !== expectedHost ||
    !secretsMatch(
      readSingleCookie(
        request.headers.get("cookie"),
        localSessionCookieName,
      ),
      config.secret,
    )
  ) {
    return reject("forbidden", 403);
  }

  const requestOriginHeader = request.headers.get("origin");
  const method = request.method.toUpperCase();
  const requiresOrigin = !["GET", "HEAD"].includes(method);
  if (
    (requestOriginHeader !== null && requestOriginHeader !== config.origin) ||
    (requiresOrigin && requestOriginHeader === null)
  ) {
    return reject("forbidden", 403);
  }

  if (request.headers.has("transfer-encoding")) {
    return reject("request-too-large", 413);
  }

  const contentEncoding = request.headers.get("content-encoding");
  if (contentEncoding && contentEncoding.toLowerCase() !== "identity") {
    return reject("unsupported-content-encoding", 415);
  }

  const rawLength = request.headers.get("content-length");
  if (rawLength !== null) {
    if (!/^(0|[1-9]\d*)$/.test(rawLength)) {
      return reject("invalid-request", 400);
    }

    const declaredLength = BigInt(rawLength);
    if (declaredLength > BigInt(maxLocalRequestBytes)) {
      return reject("request-too-large", 413);
    }
  }

  return { ok: true };
}
