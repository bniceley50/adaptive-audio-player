import { NextResponse } from "next/server";

import { verifySameOriginMutation } from "@/lib/backend/csrf";
import { getAccountSessionById, revokeAccountSession } from "@/lib/backend/sqlite";
import {
  accountCookieName,
  readSignedAccountSessionFromCookieValue,
  readVerifiedAccountIdFromCookieValue,
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

  const accountCookieValue = parseCookieValue(request, accountCookieName);
  const accountId = readVerifiedAccountIdFromCookieValue(accountCookieValue);
  const currentSession =
    readSignedAccountSessionFromCookieValue(accountCookieValue);

  if (!accountId || !currentSession) {
    return NextResponse.json(
      { error: "Sign in before managing sessions." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { sessionId?: string }
    | null;
  const sessionId = body?.sessionId?.trim() ?? "";
  if (!sessionId) {
    return NextResponse.json(
      { error: "Pick a session to revoke." },
      { status: 400 },
    );
  }

  if (sessionId === currentSession.sessionId) {
    return NextResponse.json(
      { error: "Use sign out to end the current session." },
      { status: 400 },
    );
  }

  const targetSession = getAccountSessionById(sessionId);
  if (!targetSession || targetSession.userId !== accountId || targetSession.revokedAt) {
    return NextResponse.json(
      { error: "That session is not available to revoke." },
      { status: 404 },
    );
  }

  revokeAccountSession(sessionId, "signed-out-from-account");

  return NextResponse.json({ ok: true, sessionId });
}
