import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getSessionSecret } from "./env.ts";

export const workspaceCookieName = "adaptive-audio-player.workspace";
const workspaceCookieMaxAgeSeconds = 60 * 60 * 24 * 365;

export function createWorkspaceId() {
  return `workspace-${randomUUID()}`;
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

export async function readWorkspaceIdFromRequest() {
  const cookieStore = await cookies();
  return readWorkspaceIdFromCookieValue(cookieStore.get(workspaceCookieName)?.value);
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
