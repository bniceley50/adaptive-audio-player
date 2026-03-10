import { NextResponse } from "next/server";

import {
  getGenerationOutputsForBook,
  listGenerationOutputHistoryForBook,
  listRecentGenerationJobsForBook,
} from "@/lib/backend/sqlite";
import {
  accountCookieName,
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
  const rawWorkspaceId = readWorkspaceIdFromCookieValue(
    parseCookieValue(request, workspaceCookieName),
  );
  const accountId = readVerifiedAccountIdFromCookieValue(
    parseCookieValue(request, accountCookieName),
  );
  const workspaceAccess = verifyWorkspaceAccess(rawWorkspaceId, accountId);

  if (workspaceAccess.error) {
    return NextResponse.json({ error: workspaceAccess.error }, { status: 403 });
  }

  if (!workspaceAccess.workspaceId) {
    return NextResponse.json({ error: "No workspace is active." }, { status: 401 });
  }

  return NextResponse.json({
    jobs: listRecentGenerationJobsForBook(workspaceAccess.workspaceId, bookId, 10),
    outputs: getGenerationOutputsForBook(workspaceAccess.workspaceId, bookId),
    artifacts: listGenerationOutputHistoryForBook(
      workspaceAccess.workspaceId,
      bookId,
      12,
    ),
  });
}
