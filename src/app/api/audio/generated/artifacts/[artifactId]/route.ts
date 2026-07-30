import { NextResponse } from "next/server";

import { resolveGeneratedAudioAssetPath } from "@/lib/backend/audio-storage";
import { createAudioStreamResponse } from "@/lib/backend/http-audio";
import { getGenerationArtifactById } from "@/lib/backend/sqlite";
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
  context: { params: Promise<{ artifactId: string }> },
) {
  const { artifactId } = await context.params;
  const workspaceId = readWorkspaceIdFromCookieValue(
    parseCookieValue(request, workspaceCookieName),
  );

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace is active." }, { status: 401 });
  }

  const artifact = getGenerationArtifactById(workspaceId, artifactId);
  if (!artifact?.assetPath) {
    return NextResponse.json({ error: "Audio artifact not found." }, { status: 404 });
  }

  const filePath = resolveGeneratedAudioAssetPath(artifact.assetPath);
  if (!filePath) {
    return NextResponse.json({ error: "Audio artifact is missing." }, { status: 404 });
  }

  const audioResponse = await createAudioStreamResponse(request, {
    contentType: artifact.mimeType,
    filePath,
  });
  if (audioResponse.status === 404) {
    return NextResponse.json({ error: "Audio artifact is missing." }, { status: 404 });
  }

  return audioResponse;
}
