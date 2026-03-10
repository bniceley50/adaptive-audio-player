import { NextResponse } from "next/server";

import { verifySameOriginMutation } from "@/lib/backend/csrf";
import {
  getWorkspaceLibrarySnapshot,
  getWorkspaceSyncSummary,
  linkWorkspaceToUser,
  syncWorkspaceLibrarySnapshot,
} from "@/lib/backend/sqlite";
import {
  accountCookieName,
  ensureWorkspaceCookie,
  readVerifiedAccountIdFromCookieValue,
  readWorkspaceIdFromCookieValue,
  verifyWorkspaceAccess,
  workspaceCookieName,
} from "@/lib/backend/workspace-session";
import { parseLibrarySyncSnapshot } from "@/lib/backend/validate-library-sync";

export async function GET(request: Request) {
  const existingWorkspaceId = readWorkspaceIdFromCookieValue(
    request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${workspaceCookieName}=`))
      ?.split("=")[1] ?? null,
  );
  const accountId = readVerifiedAccountIdFromCookieValue(
    request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${accountCookieName}=`))
      ?.split("=")[1] ?? null,
  );
  const workspaceAccess = verifyWorkspaceAccess(existingWorkspaceId, accountId);

  if (workspaceAccess.error) {
    return NextResponse.json({ error: workspaceAccess.error }, { status: 403 });
  }

  if (!workspaceAccess.workspaceId) {
    return NextResponse.json({ workspaceId: null, summary: null, snapshot: null });
  }

  return NextResponse.json({
    workspaceId: workspaceAccess.workspaceId,
    summary: getWorkspaceSyncSummary(workspaceAccess.workspaceId),
    snapshot: getWorkspaceLibrarySnapshot(workspaceAccess.workspaceId),
  });
}

export async function POST(request: Request) {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) {
    return csrfError;
  }

  const payload = parseLibrarySyncSnapshot(await request.json().catch(() => null));
  if (!payload) {
    return NextResponse.json(
      { error: "Invalid library sync payload." },
      { status: 400 },
    );
  }

  const existingWorkspaceId = readWorkspaceIdFromCookieValue(
    request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${workspaceCookieName}=`))
      ?.split("=")[1] ?? null,
  );
  const accountId = readVerifiedAccountIdFromCookieValue(
    request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${accountCookieName}=`))
      ?.split("=")[1] ?? null,
  );
  const workspaceAccess = verifyWorkspaceAccess(existingWorkspaceId, accountId);

  if (workspaceAccess.error) {
    return NextResponse.json({ error: workspaceAccess.error }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  const workspaceId = ensureWorkspaceCookie(response, workspaceAccess.workspaceId);
  if (accountId) {
    linkWorkspaceToUser(workspaceId, accountId);
  }
  const summary = syncWorkspaceLibrarySnapshot(workspaceId, payload);

  return NextResponse.json(
    {
      ok: true,
      workspaceId,
      summary,
    },
    {
      headers: response.headers,
    },
  );
}
