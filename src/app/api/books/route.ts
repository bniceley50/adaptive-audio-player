import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { verifySameOriginMutation } from "@/lib/backend/csrf";
import { toPublicGenerationOutput } from "@/lib/backend/public-generation";
import {
  createWorkspaceBook,
  getGenerationOutputsForBook,
  getWorkspaceBookProgress,
  listGenerationOutputHistoryForBook,
  listRecentGenerationJobsForBook,
  listWorkspaceBooks,
} from "@/lib/backend/sqlite";
import type { GenerationJobKind } from "@/lib/backend/types";
import {
  ensureWorkspaceCookie,
  readWorkspaceIdFromCookieValue,
  workspaceCookieName,
} from "@/lib/backend/workspace-session";
import { parseChapters } from "@/lib/parser/parse-chapters";
import { getImportDraftValidationError } from "@/lib/validation/import-validation";

const maxIdempotencyKeyCharacters = 128;
const maxBookCreateRequestBytes = 6_100_000;
const idempotencyKeyPattern = /^[a-z0-9][a-z0-9._-]*$/;
const generationKinds = new Set<GenerationJobKind>([
  "sample-generation",
  "full-book-generation",
]);

type BookPayloadReadResult =
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

function normalizeIdempotencyKey(value: string | null) {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (
    !normalized ||
    normalized.length > maxIdempotencyKeyCharacters ||
    !idempotencyKeyPattern.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

function buildBookActivity(workspaceId: string, bookId: string) {
  const outputs = getGenerationOutputsForBook(workspaceId, bookId);
  const artifacts = listGenerationOutputHistoryForBook(
    workspaceId,
    bookId,
    1_000,
  );
  const progress = getWorkspaceBookProgress(workspaceId, bookId);

  return {
    jobs: listRecentGenerationJobsForBook(workspaceId, bookId, 10)
      .filter(
        (job) =>
          generationKinds.has(job.kind as GenerationJobKind) &&
          typeof job.status === "string",
      )
      .map((job) => ({
        completedAt: job.completedAt,
        createdAt: job.createdAt,
        kind: job.kind,
        status: job.status,
      })),
    outputs: outputs.map((output) => {
      const publicOutput = toPublicGenerationOutput(output, artifacts);
      return {
        artifactId: publicOutput.artifactId,
        artifactUrl: publicOutput.artifactUrl,
        generatedAt: publicOutput.generatedAt,
        isCurrent: publicOutput.isCurrent,
        jobId: publicOutput.jobId,
        kind: publicOutput.kind,
      };
    }),
    progress: progress
      ? {
          artifactId: progress.artifactId,
          chapterIndex: progress.chapterIndex,
          durationSeconds: progress.durationSeconds,
          positionSeconds: progress.positionSeconds,
          updatedAt: progress.updatedAt,
        }
      : null,
  };
}

async function readBoundedBookPayload(
  request: Request,
): Promise<BookPayloadReadResult> {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > maxBookCreateRequestBytes
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
      if (totalBytes > maxBookCreateRequestBytes) {
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

export async function GET(request: Request) {
  const workspaceId = readRequestWorkspaceId(request);
  if (!workspaceId) {
    return NextResponse.json({ books: [] });
  }

  return NextResponse.json({
    books: listWorkspaceBooks(workspaceId).map((book) => ({
      ...book,
      activity: buildBookActivity(workspaceId, book.bookId),
    })),
  });
}

export async function POST(request: Request) {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) {
    return csrfError;
  }

  const existingWorkspaceId = readRequestWorkspaceId(request);

  const idempotencyKey = normalizeIdempotencyKey(
    request.headers.get("idempotency-key"),
  );
  if (!idempotencyKey) {
    return NextResponse.json(
      { error: "A valid Idempotency-Key header is required." },
      { status: 400 },
    );
  }

  const payload = await readBoundedBookPayload(request);
  if (payload.status === "too-large") {
    return NextResponse.json(
      { error: "Book request is too large." },
      { status: 413 },
    );
  }

  const body = payload.value as
    | { title?: unknown; text?: unknown }
    | null;
  if (
    !body ||
    typeof body.title !== "string" ||
    typeof body.text !== "string"
  ) {
    return NextResponse.json(
      { error: "Invalid book payload." },
      { status: 400 },
    );
  }

  const title = body.title.trim();
  if (!title) {
    return NextResponse.json(
      { error: "Add a book title before continuing." },
      { status: 400 },
    );
  }

  const text = body.text.trim();
  const chapters = parseChapters(text);
  const validationError = getImportDraftValidationError({
    title,
    text,
    chapterCount: chapters.length,
  });
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const responseWithWorkspaceCookie = NextResponse.json({ ok: true });
  const workspaceId = ensureWorkspaceCookie(
    responseWithWorkspaceCookie,
    existingWorkspaceId,
  );
  const requestFingerprint = createHash("sha256")
    .update(JSON.stringify({ title, text }))
    .digest("hex");

  try {
    const result = createWorkspaceBook({
      workspaceId,
      idempotencyKey,
      requestFingerprint,
      title,
      text,
      chapters,
    });

    if (result.status === "idempotency-conflict") {
      return NextResponse.json(
        {
          error: "This idempotency key was already used for a different book.",
        },
        { status: 409, headers: responseWithWorkspaceCookie.headers },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        replayed: result.status === "replayed",
        book: result.book,
      },
      {
        status: result.status === "created" ? 201 : 200,
        headers: responseWithWorkspaceCookie.headers,
      },
    );
  } catch {
    return NextResponse.json(
      { error: "The book could not be saved. Try again." },
      { status: 500, headers: responseWithWorkspaceCookie.headers },
    );
  }
}
