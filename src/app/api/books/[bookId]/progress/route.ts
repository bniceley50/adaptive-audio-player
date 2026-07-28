import { NextResponse } from "next/server";

import { verifySameOriginMutation } from "@/lib/backend/csrf";
import {
  getSyncedBookTitle,
  getWorkspaceBookProgress,
  saveWorkspaceBookProgress,
} from "@/lib/backend/sqlite";
import {
  readWorkspaceIdFromCookieValue,
  workspaceCookieName,
} from "@/lib/backend/workspace-session";

const maxProgressRequestBytes = 4_096;
const maxBookIdCharacters = 128;
const maxArtifactIdCharacters = 128;
const maxDurationSeconds = 604_800;
const bookIdPattern = /^book-[a-z0-9-]+$/;
const artifactIdPattern = /^artifact-[a-z0-9-]+$/;
const privateResponseHeaders = { "cache-control": "no-store" };
const progressPayloadKeys = [
  "artifactId",
  "chapterIndex",
  "durationSeconds",
  "positionSeconds",
  "revision",
  "speed",
] as const;

type ProgressPayloadReadResult =
  | { status: "ok"; value: unknown }
  | { status: "invalid" | "too-large"; value: null };

function parseCookieValue(request: Request, cookieName: string) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.split("=")[1] ?? null
  );
}

function readRequestWorkspaceId(request: Request) {
  return readWorkspaceIdFromCookieValue(
    parseCookieValue(request, workspaceCookieName),
  );
}

function normalizeBookId(value: string) {
  const normalized = value.trim().toLowerCase();
  if (
    !normalized ||
    normalized.length > maxBookIdCharacters ||
    !bookIdPattern.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

function normalizeArtifactId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (
    !normalized ||
    normalized.length > maxArtifactIdCharacters ||
    !artifactIdPattern.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

function missingBookResponse() {
  return NextResponse.json(
    { error: "Book not found." },
    { status: 404, headers: privateResponseHeaders },
  );
}

async function readBoundedProgressPayload(
  request: Request,
): Promise<ProgressPayloadReadResult> {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > maxProgressRequestBytes
  ) {
    return { status: "too-large", value: null };
  }

  if (!request.body) {
    return { status: "invalid", value: null };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }

      totalBytes += chunk.value.byteLength;
      if (totalBytes > maxProgressRequestBytes) {
        await reader.cancel();
        return { status: "too-large", value: null };
      }
      chunks.push(chunk.value);
    }
  } catch {
    return { status: "invalid", value: null };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return {
      status: "ok",
      value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    };
  } catch {
    return { status: "invalid", value: null };
  }
}

function parseProgressPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const keys = Object.keys(value).sort();
  if (
    keys.length !== progressPayloadKeys.length ||
    keys.some((key, index) => key !== [...progressPayloadKeys].sort()[index])
  ) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const artifactId = normalizeArtifactId(candidate.artifactId);
  const positionSeconds = candidate.positionSeconds;
  const durationSeconds = candidate.durationSeconds;
  const speed = candidate.speed;
  const chapterIndex = candidate.chapterIndex;
  const revision = candidate.revision;
  if (
    !artifactId ||
    typeof positionSeconds !== "number" ||
    !Number.isFinite(positionSeconds) ||
    positionSeconds < 0 ||
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > maxDurationSeconds ||
    positionSeconds > durationSeconds ||
    typeof speed !== "number" ||
    !Number.isFinite(speed) ||
    speed < 0.25 ||
    speed > 4 ||
    (chapterIndex !== null &&
      (typeof chapterIndex !== "number" ||
        !Number.isSafeInteger(chapterIndex) ||
        chapterIndex < 0)) ||
    typeof revision !== "number" ||
    !Number.isSafeInteger(revision) ||
    revision < 0
  ) {
    return null;
  }

  return {
    artifactId,
    positionSeconds,
    durationSeconds,
    speed,
    chapterIndex: chapterIndex as number | null,
    revision,
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ bookId: string }> },
) {
  const workspaceId = readRequestWorkspaceId(request);
  const bookId = normalizeBookId((await context.params).bookId);
  if (
    !workspaceId ||
    !bookId ||
    getSyncedBookTitle(workspaceId, bookId) === null
  ) {
    return missingBookResponse();
  }

  return NextResponse.json(
    {
      progress: getWorkspaceBookProgress(workspaceId, bookId),
    },
    { headers: privateResponseHeaders },
  );
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ bookId: string }> },
) {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) {
    return csrfError;
  }

  const workspaceId = readRequestWorkspaceId(request);
  const bookId = normalizeBookId((await context.params).bookId);
  if (
    !workspaceId ||
    !bookId ||
    getSyncedBookTitle(workspaceId, bookId) === null
  ) {
    return missingBookResponse();
  }

  const contentType =
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ??
    "";
  if (contentType !== "application/json") {
    return NextResponse.json(
      { error: "Progress updates must use JSON." },
      { status: 415, headers: privateResponseHeaders },
    );
  }

  const payload = await readBoundedProgressPayload(request);
  if (payload.status === "too-large") {
    return NextResponse.json(
      { error: "Progress request is too large." },
      { status: 413, headers: privateResponseHeaders },
    );
  }

  const progress = parseProgressPayload(payload.value);
  if (!progress) {
    return NextResponse.json(
      { error: "Invalid progress payload." },
      { status: 400, headers: privateResponseHeaders },
    );
  }

  try {
    const result = saveWorkspaceBookProgress({
      workspaceId,
      bookId,
      artifactId: progress.artifactId,
      positionSeconds: progress.positionSeconds,
      durationSeconds: progress.durationSeconds,
      speed: progress.speed,
      chapterIndex: progress.chapterIndex,
      expectedRevision: progress.revision,
    });

    if (result.status === "book-not-found") {
      return missingBookResponse();
    }

    if (result.status === "artifact-not-current") {
      return NextResponse.json(
        {
          error: "This audio version is no longer current. Reopen the player.",
        },
        { status: 409, headers: privateResponseHeaders },
      );
    }

    if (result.status === "invalid-chapter") {
      return NextResponse.json(
        { error: "Invalid progress payload." },
        { status: 400, headers: privateResponseHeaders },
      );
    }

    if (result.status === "conflict") {
      return NextResponse.json(
        {
          error: "Progress changed. Reload it before saving again.",
          currentRevision: result.currentRevision,
        },
        { status: 409, headers: privateResponseHeaders },
      );
    }

    return NextResponse.json(
      { progress: result.progress },
      { headers: privateResponseHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: "Progress could not be saved. Try again." },
      { status: 500, headers: privateResponseHeaders },
    );
  }
}
