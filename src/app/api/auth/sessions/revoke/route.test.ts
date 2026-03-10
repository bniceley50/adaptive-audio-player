import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/auth/sessions/revoke/route";
import {
  createAccountSession,
  listAccountSessionsForUser,
  resetDatabaseForTests,
  upsertUserByEmail,
} from "@/lib/backend/sqlite";
import { createSignedAccountSession } from "@/lib/backend/workspace-session";

describe("revoke session route", () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    resetDatabaseForTests();
    for (const dir of createdDirs.splice(0, createdDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }
    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
  });

  it("revokes another active session for the signed-in user", async () => {
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
    const otherSession = createAccountSession(
      user.id,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      "Other browser",
    );

    const response = await POST(
      new Request("http://127.0.0.1:3100/api/auth/sessions/revoke", {
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
        body: JSON.stringify({ sessionId: otherSession?.id }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      sessionId: otherSession?.id,
    });

    const activeSessions = listAccountSessionsForUser(user.id, currentSession?.id ?? "");
    expect(activeSessions).toHaveLength(1);
    expect(activeSessions[0]?.id).toBe(currentSession?.id);
  });

  it("rejects revoking the current session", async () => {
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
      new Request("http://127.0.0.1:3100/api/auth/sessions/revoke", {
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
        body: JSON.stringify({ sessionId: currentSession?.id }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Use sign out to end the current session.",
    });
  });

  it("rejects revoking a session owned by another account", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const owner = upsertUserByEmail({
      email: "owner@example.com",
      displayName: "Owner",
    });
    const intruder = upsertUserByEmail({
      email: "intruder@example.com",
      displayName: "Intruder",
    });

    const currentSession = createAccountSession(
      owner.id,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      "Current browser",
    );
    const foreignSession = createAccountSession(
      intruder.id,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      "Intruder browser",
    );

    const response = await POST(
      new Request("http://127.0.0.1:3100/api/auth/sessions/revoke", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          cookie: `adaptive-audio-player.account=${createSignedAccountSession(
            owner.id,
            currentSession?.id ?? "",
          )}`,
        },
        body: JSON.stringify({ sessionId: foreignSession?.id }),
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "That session is not available to revoke.",
    });
  });
});
