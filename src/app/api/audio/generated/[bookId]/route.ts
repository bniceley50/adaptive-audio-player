import { NextResponse } from "next/server";

import {
  getGenerationOutputForBookKind,
  getSyncedBookTitle,
  touchAccountSession,
} from "@/lib/backend/sqlite";
import { readGeneratedAudioAsset } from "@/lib/backend/audio-storage";
import {
  accountCookieName,
  readSignedAccountSessionFromCookieValue,
  readWorkspaceIdFromCookieValue,
  readVerifiedAccountIdFromCookieValue,
  verifyWorkspaceAccess,
  workspaceCookieName,
} from "@/lib/backend/workspace-session";

function parseCookieValue(request: Request, cookieName: string) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      ?.map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.split("=")[1] ?? null
  );
}

function buildPlayerPath(bookId: string, kind: "sample-generation" | "full-book-generation") {
  if (kind === "full-book-generation") {
    return `/player/${bookId}?artifact=full`;
  }

  return `/player/${bookId}?artifact=sample`;
}

function buildActivityLabel(
  title: string | null,
  kind: "sample-generation" | "full-book-generation",
) {
  const baseTitle = title?.trim() || "your audiobook";

  if (kind === "full-book-generation") {
    return `Listening to ${baseTitle} (full book)`;
  }

  return `Listening to ${baseTitle} (sample)`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await context.params;
  const rawWorkspaceId = readWorkspaceIdFromCookieValue(
    parseCookieValue(request, workspaceCookieName),
  );
  const accountId = readVerifiedAccountIdFromCookieValue(
    parseCookieValue(request, accountCookieName),
  );
  const accountSessionId =
    readSignedAccountSessionFromCookieValue(
      parseCookieValue(request, accountCookieName),
    )?.sessionId ?? null;
  const workspaceAccess = verifyWorkspaceAccess(rawWorkspaceId, accountId);
  const kind = request.url.includes("kind=full-book-generation")
    ? "full-book-generation"
    : "sample-generation";

  if (workspaceAccess.error) {
    return NextResponse.json({ error: workspaceAccess.error }, { status: 403 });
  }

  if (!workspaceAccess.workspaceId) {
    return NextResponse.json({ error: "No workspace is active." }, { status: 401 });
  }

  const output = getGenerationOutputForBookKind(
    workspaceAccess.workspaceId,
    bookId,
    kind,
  );
  if (!output?.assetPath) {
    return NextResponse.json({ error: "Audio output not found." }, { status: 404 });
  }

  const asset = readGeneratedAudioAsset(output.assetPath);
  if (!asset) {
    return NextResponse.json({ error: "Audio asset is missing." }, { status: 404 });
  }

  if (accountSessionId) {
    touchAccountSession(accountSessionId, {
      path: buildPlayerPath(bookId, kind),
      label: buildActivityLabel(
        getSyncedBookTitle(workspaceAccess.workspaceId, bookId),
        kind,
      ),
    });
  }

  return new NextResponse(asset.data, {
    headers: {
      "Content-Type": output.mimeType,
      "Cache-Control": "no-store",
    },
  });
}
