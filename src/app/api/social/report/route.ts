import { NextResponse } from "next/server";

import { featuredBookCircles } from "@/features/discovery/book-circles";
import { publicSocialMoments } from "@/features/social/public-moments";
import { verifySameOriginMutation } from "@/lib/backend/csrf";
import {
  listPublicSocialCircles,
  listPublicSocialMoments,
  reportPublicSocialContent,
} from "@/lib/backend/sqlite";
import type { PublicSocialReportContentKind } from "@/lib/backend/types";
import {
  accountCookieName,
  readVerifiedAccountIdFromCookieValue,
  readWorkspaceIdFromCookieValue,
  verifyWorkspaceAccess,
  workspaceCookieName,
} from "@/lib/backend/workspace-session";

const allowedReasons = new Set(["needs-review", "spam", "off-topic", "abusive"]);

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

function hasPublicContent(
  contentKind: PublicSocialReportContentKind,
  contentId: string,
) {
  if (contentKind === "circle") {
    return (
      featuredBookCircles.some((circle) => circle.id === contentId) ||
      listPublicSocialCircles().some((circle) => circle.id === contentId)
    );
  }

  return (
    publicSocialMoments.some((moment) => moment.id === contentId) ||
    listPublicSocialMoments().some((moment) => moment.id === contentId)
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

  if (workspaceAccess.error) {
    return NextResponse.json({ error: workspaceAccess.error }, { status: 403 });
  }

  if (!workspaceAccess.workspaceId) {
    return NextResponse.json(
      { error: "Start a workspace before reporting public content." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | {
        contentKind?: string;
        contentId?: string;
        reason?: string;
      }
    | null;
  const contentKind = body?.contentKind === "circle" || body?.contentKind === "moment"
    ? body.contentKind
    : null;
  const contentId = body?.contentId?.trim() ?? "";
  const reason = body?.reason?.trim() ?? "";

  if (!contentKind || !contentId) {
    return NextResponse.json(
      { error: "Pick public content to report." },
      { status: 400 },
    );
  }

  if (!allowedReasons.has(reason)) {
    return NextResponse.json(
      { error: "Pick a valid report reason." },
      { status: 400 },
    );
  }

  if (!hasPublicContent(contentKind, contentId)) {
    return NextResponse.json(
      { error: "That public content is no longer available." },
      { status: 404 },
    );
  }

  const report = reportPublicSocialContent({
    reporterWorkspaceId: workspaceAccess.workspaceId,
    contentKind,
    contentId,
    reason,
  });

  return NextResponse.json({
    ok: true,
    contentKind,
    contentId,
    reportCount: report.reportCount,
  });
}
