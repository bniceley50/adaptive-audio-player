import { NextResponse } from "next/server";

import { resolveGeneratedAudioAssetPath } from "@/lib/backend/audio-storage";
import { createAudioStreamResponse } from "@/lib/backend/http-audio";
import { getGenerationOutputForBookKind } from "@/lib/backend/sqlite";
import {
  readWorkspaceIdFromCookieValue,
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

export async function GET(
  request: Request,
  context: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await context.params;
  const workspaceId = readWorkspaceIdFromCookieValue(
    parseCookieValue(request, workspaceCookieName),
  );
  const kind = request.url.includes("kind=full-book-generation")
    ? "full-book-generation"
    : "sample-generation";

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace is active." }, { status: 401 });
  }

  const output = getGenerationOutputForBookKind(
    workspaceId,
    bookId,
    kind,
  );
  if (!output?.assetPath) {
    return NextResponse.json({ error: "Audio output not found." }, { status: 404 });
  }

  const filePath = resolveGeneratedAudioAssetPath(output.assetPath);
  if (!filePath) {
    return NextResponse.json({ error: "Audio asset is missing." }, { status: 404 });
  }

  const audioResponse = await createAudioStreamResponse(request, {
    contentType: output.mimeType,
    filePath,
  });
  if (audioResponse.status === 404) {
    return NextResponse.json({ error: "Audio asset is missing." }, { status: 404 });
  }

  return audioResponse;
}
