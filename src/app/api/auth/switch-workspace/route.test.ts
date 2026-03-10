import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/auth/switch-workspace/route";
import {
  createAccountSession,
  getAccountSessionById,
  linkWorkspaceToUser,
  listAccountSessionsForUser,
  resetDatabaseForTests,
  upsertUserByEmail,
} from "@/lib/backend/sqlite";
import {
  accountCookieName,
  createSignedAccountSession,
  readWorkspaceIdFromCookieValue,
  workspaceCookieName,
} from "@/lib/backend/workspace-session";

describe("switch workspace route", () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    resetDatabaseForTests();
    for (const dir of createdDirs.splice(0, createdDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }
    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
  });

  it("switches to another linked workspace for the signed-in account and rotates the account cookie", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const user = upsertUserByEmail({
      email: "gillian@example.com",
      displayName: "Gillian",
    });
    linkWorkspaceToUser("workspace-a", user.id);
    linkWorkspaceToUser("workspace-b", user.id);

    const currentSession = createAccountSession(
      user.id,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      "Current browser",
    );

    const response = await POST(
      new Request("http://127.0.0.1:3100/api/auth/switch-workspace", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15",
          cookie: `${accountCookieName}=${createSignedAccountSession(
            user.id,
            currentSession?.id ?? "",
          )}`,
        },
        body: JSON.stringify({ workspaceId: "workspace-b" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      workspaceId: "workspace-b",
    });

    expect(
      readWorkspaceIdFromCookieValue(response.cookies.get(workspaceCookieName)?.value ?? null),
    ).toBe("workspace-b");

    const nextAccountCookie = response.cookies.get(accountCookieName)?.value ?? null;
    expect(nextAccountCookie).toBeTruthy();

    const activeSessions = listAccountSessionsForUser(user.id);
    expect(activeSessions.length).toBeGreaterThanOrEqual(2);
    expect(activeSessions.some((session) => session.id === currentSession?.id)).toBe(true);

    const persistedCurrentSession = getAccountSessionById(currentSession?.id ?? "");
    expect(persistedCurrentSession?.revokedAt).toBeNull();
  });

  it("rejects switching to an unlinked workspace", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const user = upsertUserByEmail({
      email: "gillian@example.com",
      displayName: "Gillian",
    });
    linkWorkspaceToUser("workspace-a", user.id);

    const currentSession = createAccountSession(
      user.id,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      "Current browser",
    );

    const response = await POST(
      new Request("http://127.0.0.1:3100/api/auth/switch-workspace", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          cookie: `${accountCookieName}=${createSignedAccountSession(
            user.id,
            currentSession?.id ?? "",
          )}`,
        },
        body: JSON.stringify({ workspaceId: "workspace-foreign" }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "That workspace is not linked to this account.",
    });
  });

  it("requires a signed-in account", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const response = await POST(
      new Request("http://127.0.0.1:3100/api/auth/switch-workspace", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
        },
        body: JSON.stringify({ workspaceId: "workspace-b" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Sign in before switching workspaces.",
    });
  });
});
