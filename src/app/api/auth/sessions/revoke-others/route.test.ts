import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/auth/sessions/revoke-others/route";
import {
  createAccountSession,
  listAccountSessionsForUser,
  resetDatabaseForTests,
  upsertUserByEmail,
} from "@/lib/backend/sqlite";
import { createSignedAccountSession } from "@/lib/backend/workspace-session";

describe("revoke other sessions route", () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    resetDatabaseForTests();
    for (const dir of createdDirs.splice(0, createdDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }
    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
  });

  it("revokes every other active session for the signed-in user", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const user = upsertUserByEmail({
      email: "gillian@example.com",
      displayName: "Gillian",
    });

    const currentSession = createAccountSession(
      user.id,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      "Current browser",
    );
    createAccountSession(
      user.id,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      "Other browser",
    );
    createAccountSession(
      user.id,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      "Phone browser",
    );

    const response = await POST(
      new Request("http://127.0.0.1:3100/api/auth/sessions/revoke-others", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          cookie: `adaptive-audio-player.account=${createSignedAccountSession(
            user.id,
            currentSession?.id ?? "",
          )}`,
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      revokedCount: 2,
    });

    const activeSessions = listAccountSessionsForUser(user.id, currentSession?.id ?? "");
    expect(activeSessions).toHaveLength(1);
    expect(activeSessions[0]?.id).toBe(currentSession?.id);
  });

  it("returns zero when there are no other active sessions", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const user = upsertUserByEmail({
      email: "gillian@example.com",
      displayName: "Gillian",
    });

    const currentSession = createAccountSession(
      user.id,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      "Current browser",
    );

    const response = await POST(
      new Request("http://127.0.0.1:3100/api/auth/sessions/revoke-others", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          cookie: `adaptive-audio-player.account=${createSignedAccountSession(
            user.id,
            currentSession?.id ?? "",
          )}`,
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      revokedCount: 0,
    });
  });

  it("requires a signed-in account", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const response = await POST(
      new Request("http://127.0.0.1:3100/api/auth/sessions/revoke-others", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
        },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Sign in before managing sessions.",
    });
  });
});
