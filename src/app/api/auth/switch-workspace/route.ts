import { NextResponse } from "next/server";

import { verifySameOriginMutation } from "@/lib/backend/csrf";
import { getUserById, listWorkspacesForUser } from "@/lib/backend/sqlite";
import {
  accountCookieName,
  createAndSetAccountCookie,
  describeSessionLabelFromUserAgent,
  readVerifiedAccountIdFromCookieValue,
  setWorkspaceCookie,
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

  const accountId = readVerifiedAccountIdFromCookieValue(
    parseCookieValue(request, accountCookieName),
  );
  if (!accountId) {
    return NextResponse.json({ error: "Sign in before switching workspaces." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { workspaceId?: string }
    | null;
  const nextWorkspaceId = body?.workspaceId?.trim() ?? "";
  if (!nextWorkspaceId) {
    return NextResponse.json({ error: "Pick a workspace to switch to." }, { status: 400 });
  }

  const allowedWorkspaceIds = new Set(
    listWorkspacesForUser(accountId).map((workspace) => workspace.workspaceId),
  );
  if (!allowedWorkspaceIds.has(nextWorkspaceId)) {
    return NextResponse.json({ error: "That workspace is not linked to this account." }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true, workspaceId: nextWorkspaceId });
  setWorkspaceCookie(response, nextWorkspaceId);
  if (getUserById(accountId)) {
    createAndSetAccountCookie(
      response,
      accountId,
      describeSessionLabelFromUserAgent(request.headers.get("user-agent")),
    );
  }
  return response;
}
