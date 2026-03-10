import { NextResponse } from "next/server";

import { verifySameOriginMutation } from "@/lib/backend/csrf";
import {
  enqueueGenerationJob,
  linkWorkspaceToUser,
} from "@/lib/backend/sqlite";
import {
  accountCookieName,
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

export async function POST(request: Request) {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) {
    return csrfError;
  }

  const body = (await request.json().catch(() => null)) as
    | { bookId?: string; chapterCount?: number }
    | null;

  const bookId = body?.bookId?.trim() ?? "";
  const chapterCount =
    typeof body?.chapterCount === "number" && Number.isFinite(body.chapterCount)
      ? Math.max(0, Math.floor(body.chapterCount))
      : 0;

  if (!bookId || chapterCount <= 0) {
    return NextResponse.json(
      { error: "Book id and chapter count are required." },
      { status: 400 },
    );
  }

  const existingWorkspaceId = readWorkspaceIdFromCookieValue(
    parseCookieValue(request, workspaceCookieName),
  );
  const accountId = readVerifiedAccountIdFromCookieValue(
    parseCookieValue(request, accountCookieName),
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

  const job = enqueueGenerationJob({
    workspaceId,
    kind: "full-book-generation",
    bookId,
    narratorId: null,
    mode: null,
    chapterCount,
  });

  return NextResponse.json(
    { ok: true, workspaceId, job },
    {
      headers: response.headers,
    },
  );
}
