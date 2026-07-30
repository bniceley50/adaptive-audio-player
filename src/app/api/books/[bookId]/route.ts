import { NextResponse } from "next/server";

import { verifySameOriginMutation } from "@/lib/backend/csrf";
import {
  deleteWorkspaceBook,
  getSyncedBookTitle,
  getWorkspaceBook,
} from "@/lib/backend/sqlite";
import {
  readWorkspaceIdFromCookieValue,
  workspaceCookieName,
} from "@/lib/backend/workspace-session";

const bookIdPattern = /^book-[a-z0-9-]+$/;
const maxBookIdCharacters = 128;
const privateResponseHeaders = { "cache-control": "no-store" };

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

function readRequestWorkspaceId(request: Request) {
  return readWorkspaceIdFromCookieValue(
    parseCookieValue(request, workspaceCookieName),
  );
}

function normalizeBookId(value: string) {
  const normalized = value.trim().toLowerCase();
  if (
    !normalized ||
    normalized.length > maxBookIdCharacters ||
    !bookIdPattern.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

function missingBookResponse() {
  return NextResponse.json(
    { error: "Book not found." },
    { status: 404, headers: privateResponseHeaders },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ bookId: string }> },
) {
  const workspaceId = readRequestWorkspaceId(request);
  const bookId = normalizeBookId((await context.params).bookId);
  if (!workspaceId || !bookId) {
    return missingBookResponse();
  }

  const book = getWorkspaceBook(workspaceId, bookId);
  if (!book) {
    return missingBookResponse();
  }

  return NextResponse.json(
    { book },
    { headers: privateResponseHeaders },
  );
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ bookId: string }> },
) {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) {
    return csrfError;
  }

  const workspaceId = readRequestWorkspaceId(request);
  const bookId = normalizeBookId((await context.params).bookId);
  if (
    !workspaceId ||
    !bookId ||
    getSyncedBookTitle(workspaceId, bookId) === null
  ) {
    return NextResponse.json({ ok: true, deleted: false });
  }

  const result = deleteWorkspaceBook(workspaceId, bookId);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Book cleanup could not finish safely. Try again." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, deleted: true });
}
