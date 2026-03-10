import { NextResponse } from "next/server";

import { getGenerationJob } from "@/lib/backend/sqlite";
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
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
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

  const job = getGenerationJob(jobId, workspaceAccess.workspaceId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  return NextResponse.json({ job });
}
