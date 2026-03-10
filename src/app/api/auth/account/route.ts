import { NextResponse } from "next/server";

import { verifySameOriginMutation } from "@/lib/backend/csrf";
import {
  getUserById,
  getWorkspaceUser,
  linkWorkspaceToUser,
  upsertUserByEmail,
} from "@/lib/backend/sqlite";
import {
  accountCookieName,
  createAndSetAccountCookie,
  describeSessionLabelFromUserAgent,
  ensureWorkspaceCookie,
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
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.split("=")[1] ?? null
  );
}

export async function GET(request: Request) {
  const accountId = readVerifiedAccountIdFromCookieValue(
    parseCookieValue(request, accountCookieName),
  );
  const rawWorkspaceId = readWorkspaceIdFromCookieValue(
    parseCookieValue(request, workspaceCookieName),
  );
  const workspaceAccess = verifyWorkspaceAccess(rawWorkspaceId, accountId);

  const user =
    (accountId ? getUserById(accountId) : null) ??
    (workspaceAccess.workspaceId
      ? getWorkspaceUser(workspaceAccess.workspaceId)
      : null);

  return NextResponse.json({
    user,
    workspaceId: workspaceAccess.workspaceId,
  });
}

export async function POST(request: Request) {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) {
    return csrfError;
  }

  const body = (await request.json().catch(() => null)) as
    | { email?: string; displayName?: string }
    | null;

  const email = body?.email?.trim().toLowerCase() ?? "";
  const displayName = body?.displayName?.trim() ?? "";

  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const user = upsertUserByEmail({
    email,
    displayName,
  });

  const existingWorkspaceId = readWorkspaceIdFromCookieValue(
    parseCookieValue(request, workspaceCookieName),
  );
  const response = NextResponse.json({ ok: true, user });
  const existingWorkspaceUser = existingWorkspaceId
    ? getWorkspaceUser(existingWorkspaceId)
    : null;
  const reusableWorkspaceId =
    !existingWorkspaceUser || existingWorkspaceUser.id === user.id
      ? existingWorkspaceId
      : null;
  const workspaceId = ensureWorkspaceCookie(response, reusableWorkspaceId);
  linkWorkspaceToUser(workspaceId, user.id);
  createAndSetAccountCookie(
    response,
    user.id,
    describeSessionLabelFromUserAgent(request.headers.get("user-agent")),
  );

  return response;
}
