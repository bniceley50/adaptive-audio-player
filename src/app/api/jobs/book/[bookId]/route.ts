import { NextResponse } from "next/server";

import {
  toPublicGenerationArtifact,
  toPublicGenerationJob,
  toPublicGenerationOutput,
} from "@/lib/backend/public-generation";
import {
  getGenerationOutputsForBook,
  listGenerationOutputHistoryForBook,
  listRecentGenerationJobsForBook,
} from "@/lib/backend/sqlite";
import {
  readWorkspaceIdFromCookieValue,
  workspaceCookieName,
} from "@/lib/backend/workspace-session";

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

export async function GET(
  request: Request,
  context: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await context.params;
  const workspaceId = readWorkspaceIdFromCookieValue(
    parseCookieValue(request, workspaceCookieName),
  );
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace is active." }, { status: 401 });
  }

  const outputs = getGenerationOutputsForBook(workspaceId, bookId);
  const artifacts = listGenerationOutputHistoryForBook(
    workspaceId,
    bookId,
    12,
  );

  return NextResponse.json({
    jobs: listRecentGenerationJobsForBook(workspaceId, bookId, 10).map(
      toPublicGenerationJob,
    ),
    outputs: outputs.map((output) =>
      toPublicGenerationOutput(output, artifacts),
    ),
    artifacts: artifacts.map((artifact) =>
      toPublicGenerationArtifact(artifact, outputs),
    ),
  });
}
