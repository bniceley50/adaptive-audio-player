import { NextResponse } from "next/server";

import { getWorkspaceBook } from "@/lib/backend/book-repository";
import { verifySameOriginMutation } from "@/lib/backend/csrf";
import { toPublicGenerationJob } from "@/lib/backend/public-generation";
import { getNarrationEngineStatus } from "@/lib/backend/tts-engine-capabilities";
import {
  enqueueGenerationJob,
  getActiveGenerationJobForBookKind,
  getGenerationOutputForBookKind,
} from "@/lib/backend/sqlite";
import {
  COMPATIBILITY_NARRATION_MODE,
  validateGenerationRequest,
  type GenerationRequestValidationErrorCode,
} from "@/lib/backend/validate-generation-request";
import {
  ensureWorkspaceCookie,
  readWorkspaceIdFromCookieValue,
  workspaceCookieName,
} from "@/lib/backend/workspace-session";
import { FAST_NARRATION_ENGINE_ID } from "@/lib/narration/engines";

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

function validationErrorStatus(code: GenerationRequestValidationErrorCode) {
  if (code === "book-not-found" || code === "book-access-denied") {
    return 404;
  }

  if (code === "duplicate-active-job") {
    return 409;
  }

  return 400;
}

export async function POST(request: Request) {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) {
    return csrfError;
  }

  const body = (await request.json().catch(() => null)) as
    | { bookId?: unknown }
    | null;

  const existingWorkspaceId = readWorkspaceIdFromCookieValue(
    parseCookieValue(request, workspaceCookieName),
  );
  const response = NextResponse.json({ ok: true });
  const workspaceId = ensureWorkspaceCookie(response, existingWorkspaceId);

  const requestedBookId =
    typeof body?.bookId === "string" ? body.bookId.trim().toLowerCase() : "";
  const storedBook = requestedBookId
    ? getWorkspaceBook(workspaceId, requestedBookId)
    : null;
  const currentSample = requestedBookId
    ? getGenerationOutputForBookKind(
        workspaceId,
        requestedBookId,
        "sample-generation",
      )
    : null;
  const sampledNarratorId =
    currentSample?.mode === COMPATIBILITY_NARRATION_MODE &&
    currentSample.assetPath.trim()
      ? currentSample.narratorId
      : null;
  const sampledEngineId =
    currentSample?.mode === COMPATIBILITY_NARRATION_MODE &&
    currentSample.assetPath.trim()
      ? currentSample.engineId
      : null;
  const activeJob = requestedBookId
    ? getActiveGenerationJobForBookKind(
        workspaceId,
        requestedBookId,
        "full-book-generation",
      )
    : null;
  const validation = validateGenerationRequest({
    workspaceId,
    kind: "full-book-generation",
    bookId: body?.bookId,
    narratorId: sampledNarratorId ?? "marlowe",
    engineId: sampledEngineId ?? FAST_NARRATION_ENGINE_ID,
    mode: COMPATIBILITY_NARRATION_MODE,
    book:
      storedBook
        ? {
            workspaceId,
            bookId: storedBook.bookId,
            chapterCount: storedBook.chapterCount,
            text: storedBook.manuscript,
          }
        : null,
    existingJobs: activeJob ? [activeJob] : [],
  });

  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error.message },
      {
        status: validationErrorStatus(validation.error.code),
        headers: response.headers,
      },
    );
  }

  const engineStatus = (await getNarrationEngineStatus()).engines.find(
    (engine) => engine.id === validation.value.engineId,
  );
  if (!engineStatus?.selectable) {
    return NextResponse.json(
      {
        error:
          engineStatus?.statusMessage ??
          "The sampled listening quality is unavailable. Use Fast / Compatible and create a new sample.",
      },
      { status: 503, headers: response.headers },
    );
  }

  const job = enqueueGenerationJob(validation.value);
  if (!job) {
    return NextResponse.json(
      { error: "Audio generation could not be started. Try again." },
      { status: 500, headers: response.headers },
    );
  }

  return NextResponse.json(
    { ok: true, job: toPublicGenerationJob(job) },
    {
      status: 201,
      headers: response.headers,
    },
  );
}
