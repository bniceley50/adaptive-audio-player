import { NextResponse } from "next/server";

import { verifySameOriginMutation } from "@/lib/backend/csrf";
import {
  revokeAccountSession,
} from "@/lib/backend/sqlite";
import {
  createWorkspaceId,
  clearAccountCookie,
  accountCookieName,
  readSignedAccountSessionFromCookieValue,
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

  const accountSession = readSignedAccountSessionFromCookieValue(
    parseCookieValue(request, accountCookieName),
  );
  const response = NextResponse.json({ ok: true });
  setWorkspaceCookie(response, createWorkspaceId());
  if (accountSession) {
    revokeAccountSession(accountSession.sessionId, "signed-out");
  }
  clearAccountCookie(response);
  return response;
}
