import { NextResponse } from "next/server";

import { readGeneratedAudioAsset } from "@/lib/backend/audio-storage";
import {
  getGenerationArtifactById,
  getSyncedBookTitle,
  touchAccountSession,
} from "@/lib/backend/sqlite";
import {
  accountCookieName,
  readSignedAccountSessionFromCookieValue,
  readVerifiedAccountIdFromCookieValue,
  readWorkspaceIdFromCookieValue,
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

function buildArchivedPlayerPath(
  bookId: string,
  artifactId: string,
  kind: "sample-generation" | "full-book-generation",
) {
  return `/player/${bookId}?artifactId=${artifactId}&artifactKind=${kind}&renderState=archived`;
}

function buildArchivedActivityLabel(
  title: string | null,
  kind: "sample-generation" | "full-book-generation",
) {
  const baseTitle = title?.trim() || "your audiobook";

  if (kind === "full-book-generation") {
    return `Listening to ${baseTitle} (archived full book)`;
  }

  return `Listening to ${baseTitle} (archived sample)`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ artifactId: string }> },
) {
  const { artifactId } = await context.params;
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

  if (workspaceAccess.error) {
    return NextResponse.json({ error: workspaceAccess.error }, { status: 403 });
  }

  if (!workspaceAccess.workspaceId) {
    return NextResponse.json({ error: "No workspace is active." }, { status: 401 });
  }

  const artifact = getGenerationArtifactById(
    workspaceAccess.workspaceId,
    artifactId,
  );
  if (!artifact?.assetPath) {
    return NextResponse.json({ error: "Audio artifact not found." }, { status: 404 });
  }

  const asset = readGeneratedAudioAsset(artifact.assetPath);
  if (!asset) {
    return NextResponse.json({ error: "Audio artifact is missing." }, { status: 404 });
  }

  if (accountSessionId) {
    touchAccountSession(accountSessionId, {
      path: buildArchivedPlayerPath(artifact.bookId, artifact.id, artifact.kind),
      label: buildArchivedActivityLabel(
        getSyncedBookTitle(workspaceAccess.workspaceId, artifact.bookId),
        artifact.kind,
      ),
    });
  }

  return new NextResponse(asset.data, {
    headers: {
      "Content-Type": artifact.mimeType,
      "Cache-Control": "no-store",
    },
  });
}
