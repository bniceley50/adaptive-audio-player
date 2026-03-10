import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/auth/sign-out/route";
import {
  createAccountSession,
  getAccountSessionById,
  resetDatabaseForTests,
  upsertUserByEmail,
} from "@/lib/backend/sqlite";
import {
  accountCookieName,
  createSignedAccountSession,
  readWorkspaceIdFromCookieValue,
  workspaceCookieName,
} from "@/lib/backend/workspace-session";

describe("sign out route", () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    resetDatabaseForTests();
    for (const dir of createdDirs.splice(0, createdDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }
    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
  });

  it("revokes the current session, clears the account cookie, and provisions a fresh workspace", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const user = upsertUserByEmail({
      email: "gillian@example.com",
      displayName: "Gillian",
    });
    const session = createAccountSession(
      user.id,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      "Current browser",
    );

    const response = await POST(
      new Request("http://127.0.0.1:3100/api/auth/sign-out", {
        method: "POST",
        headers: {
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          cookie: `${accountCookieName}=${createSignedAccountSession(
            user.id,
            session?.id ?? "",
          )}`,
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });

    const endedSession = getAccountSessionById(session?.id ?? "");
    expect(endedSession?.revokedAt).not.toBeNull();
    expect(endedSession?.endedReason).toBe("signed-out");

    expect(response.cookies.get(accountCookieName)?.maxAge).toBe(0);

    const nextWorkspaceCookie = response.cookies.get(workspaceCookieName)?.value ?? null;
    const nextWorkspaceId = readWorkspaceIdFromCookieValue(nextWorkspaceCookie);
    expect(nextWorkspaceId).toMatch(/^workspace-/);
  });

  it("still clears auth state when no signed-in session is present", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const response = await POST(
      new Request("http://127.0.0.1:3100/api/auth/sign-out", {
        method: "POST",
        headers: {
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.cookies.get(accountCookieName)?.maxAge).toBe(0);
    expect(
      readWorkspaceIdFromCookieValue(response.cookies.get(workspaceCookieName)?.value ?? null),
    ).toMatch(/^workspace-/);
  });
});
