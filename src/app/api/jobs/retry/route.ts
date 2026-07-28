import { NextResponse } from "next/server";

import { verifySameOriginMutation } from "@/lib/backend/csrf";
import { toPublicGenerationJob } from "@/lib/backend/public-generation";
import { retryGenerationJob } from "@/lib/backend/sqlite";
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

export async function POST(request: Request) {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) {
    return csrfError;
  }

  const workspaceId = readWorkspaceIdFromCookieValue(
    parseCookieValue(request, workspaceCookieName),
  );
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace is active." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { jobId?: string }
    | null;
  const jobId = body?.jobId?.trim() ?? "";

  if (!jobId) {
    return NextResponse.json({ error: "Job id is required." }, { status: 400 });
  }

  const job = retryGenerationJob(jobId, workspaceId);
  if (!job) {
    return NextResponse.json(
      { error: "Only failed jobs in the current workspace can be retried." },
      { status: 404 },
    );
  }

  return NextResponse.json({ job: toPublicGenerationJob(job) });
}
