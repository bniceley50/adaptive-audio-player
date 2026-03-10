import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  createAccountSession,
  getAccountSessionById,
  getWorkspaceUser,
  revokeAccountSession,
  touchAccountSession,
} from "@/lib/backend/sqlite";

export const workspaceCookieName = "adaptive-audio-player.workspace";
export const accountCookieName = "adaptive-audio-player.account";
const developmentSessionSecret = "adaptive-audio-player-dev-session-secret";
const accountSessionMaxAgeSeconds = 60 * 60 * 24 * 30;
const workspaceCookieMaxAgeSeconds = 60 * 60 * 24 * 365;

export function createWorkspaceId() {
  return `workspace-${randomUUID()}`;
}

function getSessionSecret() {
  return (
    process.env.ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET ||
    developmentSessionSecret
  );
}

function signSessionPayload(payload: string) {
  return createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
}

function encodeWorkspacePayload(payload: { workspaceId: string }) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeWorkspacePayload(encodedPayload: string) {
  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as { workspaceId?: unknown } | null;

    if (!parsed || typeof parsed.workspaceId !== "string") {
      return null;
    }

    return {
      workspaceId: parsed.workspaceId,
    };
  } catch {
    return null;
  }
}

function encodeAccountSessionPayload(payload: {
  accountId: string;
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
}) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeAccountSessionPayload(encodedPayload: string) {
  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as
      | {
          accountId?: unknown;
          sessionId?: unknown;
          issuedAt?: unknown;
          expiresAt?: unknown;
        }
      | null;

    if (
      !parsed ||
      typeof parsed.accountId !== "string" ||
      typeof parsed.sessionId !== "string" ||
      typeof parsed.issuedAt !== "number" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }

    return {
      accountId: parsed.accountId,
      sessionId: parsed.sessionId,
      issuedAt: parsed.issuedAt,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

export function createSignedAccountSession(
  accountId: string,
  sessionId: string,
  now = Date.now(),
) {
  const issuedAt = Math.floor(now / 1000);
  const expiresAt = issuedAt + accountSessionMaxAgeSeconds;
  const payload = encodeAccountSessionPayload({
    accountId,
    sessionId,
    issuedAt,
    expiresAt,
  });

  return `${payload}.${signSessionPayload(payload)}`;
}

export function createSignedWorkspaceCookieValue(workspaceId: string) {
  const payload = encodeWorkspacePayload({ workspaceId });
  return `${payload}.${signSessionPayload(payload)}`;
}

export function readWorkspaceIdFromCookieValue(value: string | null | undefined) {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return null;
  }

  const separatorIndex = trimmedValue.lastIndexOf(".");
  if (separatorIndex <= 0 || separatorIndex === trimmedValue.length - 1) {
    return null;
  }

  const payload = trimmedValue.slice(0, separatorIndex);
  const signature = trimmedValue.slice(separatorIndex + 1);
  const expectedSignature = signSessionPayload(payload);

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  return decodeWorkspacePayload(payload)?.workspaceId ?? null;
}

export function readSignedAccountSessionFromCookieValue(
  cookieValue: string | null | undefined,
  now = Date.now(),
) {
  const value = cookieValue?.trim();
  if (!value) {
    return null;
  }

  const separatorIndex = value.lastIndexOf(".");
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return null;
  }

  const payload = value.slice(0, separatorIndex);
  const signature = value.slice(separatorIndex + 1);
  const expectedSignature = signSessionPayload(payload);

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  const decodedPayload = decodeAccountSessionPayload(payload);
  if (!decodedPayload) {
    return null;
  }

  const currentTimestamp = Math.floor(now / 1000);
  if (decodedPayload.expiresAt <= currentTimestamp) {
    return null;
  }

  return decodedPayload;
}

export function readSignedAccountIdFromCookieValue(
  cookieValue: string | null | undefined,
  now = Date.now(),
) {
  return readSignedAccountSessionFromCookieValue(cookieValue, now)?.accountId ?? null;
}

export function readVerifiedAccountIdFromCookieValue(
  cookieValue: string | null | undefined,
  now = Date.now(),
) {
  const session = readSignedAccountSessionFromCookieValue(cookieValue, now);
  if (!session) {
    return null;
  }

  const persistedSession = getAccountSessionById(session.sessionId);
  if (
    !persistedSession ||
    persistedSession.userId !== session.accountId ||
    persistedSession.revokedAt
  ) {
    return null;
  }

  if (new Date(persistedSession.expiresAt).getTime() <= now) {
    revokeAccountSession(session.sessionId, "expired");
    return null;
  }

  touchAccountSession(session.sessionId);
  return session.accountId;
}

export function verifyWorkspaceAccess(
  workspaceId: string | null | undefined,
  accountId: string | null | undefined,
) {
  if (!workspaceId) {
    return {
      workspaceId: null,
      error: null,
    };
  }

  const workspaceUser = getWorkspaceUser(workspaceId);
  if (!workspaceUser) {
    return {
      workspaceId,
      error: null,
    };
  }

  if (!accountId) {
    return {
      workspaceId: null,
      error: "Sign in to access this linked workspace.",
    };
  }

  if (workspaceUser.id !== accountId) {
    return {
      workspaceId: null,
      error: "This workspace belongs to another account.",
    };
  }

  return {
    workspaceId,
    error: null,
  };
}

export async function readWorkspaceIdFromRequest() {
  const cookieStore = await cookies();
  return readWorkspaceIdFromCookieValue(cookieStore.get(workspaceCookieName)?.value);
}

export async function readAccountIdFromRequest() {
  const cookieStore = await cookies();
  return readVerifiedAccountIdFromCookieValue(cookieStore.get(accountCookieName)?.value);
}

export async function readAccountSessionIdFromRequest() {
  const cookieStore = await cookies();
  return (
    readSignedAccountSessionFromCookieValue(cookieStore.get(accountCookieName)?.value)
      ?.sessionId ?? null
  );
}

export function ensureWorkspaceCookie(
  response: NextResponse,
  existingWorkspaceId?: string | null,
) {
  const workspaceId = existingWorkspaceId?.trim() || createWorkspaceId();
  setWorkspaceCookie(response, workspaceId);
  return workspaceId;
}

export function setWorkspaceCookie(
  response: NextResponse,
  workspaceId: string,
) {
  response.cookies.set(
    workspaceCookieName,
    createSignedWorkspaceCookieValue(workspaceId),
    {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
      maxAge: workspaceCookieMaxAgeSeconds,
    },
  );
}

export function setAccountCookie(
  response: NextResponse,
  accountId: string,
  sessionId: string,
) {
  response.cookies.set(
    accountCookieName,
    createSignedAccountSession(accountId, sessionId),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: accountSessionMaxAgeSeconds,
    },
  );
}

export function createAndSetAccountCookie(
  response: NextResponse,
  accountId: string,
  sessionLabel?: string | null,
  now = Date.now(),
) {
  const expiresAt = new Date(now + accountSessionMaxAgeSeconds * 1000).toISOString();
  const session = createAccountSession(accountId, expiresAt, sessionLabel);
  if (!session) {
    return null;
  }

  setAccountCookie(response, accountId, session.id);
  return session;
}

export function clearAccountCookie(response: NextResponse) {
  response.cookies.set(accountCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function describeSessionLabelFromUserAgent(
  userAgent: string | null | undefined,
) {
  const normalized = userAgent?.trim();
  if (!normalized) {
    return "Unknown browser";
  }

  const platform = normalized.includes("iPhone")
    ? "iPhone"
    : normalized.includes("iPad")
      ? "iPad"
      : normalized.includes("Android")
        ? "Android"
        : normalized.includes("Mac OS X")
          ? "Mac"
          : normalized.includes("Windows")
            ? "Windows"
            : normalized.includes("Linux")
              ? "Linux"
              : null;

  const browser = normalized.includes("Edg/")
    ? "Edge"
    : normalized.includes("FxiOS") || normalized.includes("Firefox/")
      ? "Firefox"
      : normalized.includes("CriOS") || normalized.includes("Chrome/")
        ? "Chrome"
        : normalized.includes("Safari/")
          ? "Safari"
          : null;

  if (browser && platform) {
    return `${browser} on ${platform}`;
  }

  return browser ?? platform ?? "Unknown browser";
}
