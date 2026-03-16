import { NextResponse } from "next/server";

import { verifySameOriginMutation } from "@/lib/backend/csrf";
import { isModerationReviewerAccount } from "@/lib/backend/moderation";
import { updatePublicSocialModerationState } from "@/lib/backend/sqlite";
import type {
  PublicSocialModerationAction,
  PublicSocialReportContentKind,
} from "@/lib/backend/types";
import {
  accountCookieName,
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

  const existingWorkspaceId = readWorkspaceIdFromCookieValue(
    parseCookieValue(request, workspaceCookieName),
  );
  const accountId = readVerifiedAccountIdFromCookieValue(
    parseCookieValue(request, accountCookieName),
  );
  const workspaceAccess = verifyWorkspaceAccess(existingWorkspaceId, accountId);
  const isReviewer = isModerationReviewerAccount(accountId);

  if (workspaceAccess.error && !isReviewer) {
    return NextResponse.json({ error: workspaceAccess.error }, { status: 403 });
  }

  if (!workspaceAccess.workspaceId) {
    return NextResponse.json(
      { error: "Start a workspace before moderating public content." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | {
        contentKind?: string;
        contentId?: string;
        action?: string;
      }
    | null;
  const contentKind = body?.contentKind === "circle" || body?.contentKind === "moment"
    ? (body.contentKind as PublicSocialReportContentKind)
    : null;
  const action = body?.action === "hide" || body?.action === "restore"
    ? (body.action as PublicSocialModerationAction)
    : null;
  const contentId = body?.contentId?.trim() ?? "";

  if (!contentKind || !action || !contentId) {
    return NextResponse.json(
      { error: "Pick public content and a moderation action." },
      { status: 400 },
    );
  }

  const result = updatePublicSocialModerationState({
    workspaceId: workspaceAccess.workspaceId,
    isReviewer,
    contentKind,
    contentId,
    action,
  });

  if ("error" in result) {
    if (result.error === "not-found") {
      return NextResponse.json(
        { error: "That public content is no longer available." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { error: "Only the owner or an allowlisted reviewer can manage this public content." },
      { status: 403 },
    );
  }

  return NextResponse.json({
    ok: true,
    contentKind,
    contentId,
    moderationStatus: result.moderationStatus,
  });
}
