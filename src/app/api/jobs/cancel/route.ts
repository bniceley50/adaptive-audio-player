import { NextResponse } from "next/server";

import { verifySameOriginMutation } from "@/lib/backend/csrf";
import { cancelGenerationJob } from "@/lib/backend/sqlite";
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

export async function POST(request: Request) {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) {
    return csrfError;
  }

  const workspaceId = readWorkspaceIdFromCookieValue(
    parseCookieValue(request, workspaceCookieName),
  );
  const accountId = readVerifiedAccountIdFromCookieValue(
    parseCookieValue(request, accountCookieName),
  );
  const workspaceAccess = verifyWorkspaceAccess(workspaceId, accountId);
  if (workspaceAccess.error) {
    return NextResponse.json({ error: workspaceAccess.error }, { status: 403 });
  }
  if (!workspaceAccess.workspaceId) {
    return NextResponse.json({ error: "No workspace is active." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { jobId?: string }
    | null;
  const jobId = body?.jobId?.trim() ?? "";

  if (!jobId) {
    return NextResponse.json({ error: "Job id is required." }, { status: 400 });
  }

  const job = cancelGenerationJob(jobId, workspaceAccess.workspaceId);
  if (!job) {
    return NextResponse.json(
      { error: "Only queued or running jobs in the current workspace can be cancelled." },
      { status: 404 },
    );
  }

  return NextResponse.json({ job });
}
