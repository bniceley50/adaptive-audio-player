import { afterEach, describe, expect, it } from "vitest";

import { GET, POST } from "@/app/api/auth/account/route";
import {
  getWorkspaceUser,
  linkWorkspaceToUser,
  resetDatabaseForTests,
  upsertUserByEmail,
} from "@/lib/backend/sqlite";
import {
  createSignedWorkspaceCookieValue,
  readWorkspaceIdFromCookieValue,
  workspaceCookieName,
} from "@/lib/backend/workspace-session";

describe("account route", () => {
  afterEach(() => {
    resetDatabaseForTests();
  });

  it("does not expose a linked workspace user without the owning account", async () => {
    const owner = upsertUserByEmail({
      email: "owner@example.com",
      displayName: "Owner",
    });
    linkWorkspaceToUser("workspace-owned", owner.id);

    const response = await GET(
      new Request("http://127.0.0.1:3100/api/auth/account", {
        headers: {
          cookie: `${workspaceCookieName}=${createSignedWorkspaceCookieValue("workspace-owned")}`,
        },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      user: null,
      workspaceId: null,
    });
  });

  it("creates a fresh workspace instead of relinking another user's workspace", async () => {
    const owner = upsertUserByEmail({
      email: "owner@example.com",
      displayName: "Owner",
    });
    linkWorkspaceToUser("workspace-owned", owner.id);

    const response = await POST(
      new Request("http://127.0.0.1:3100/api/auth/account", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          cookie: `${workspaceCookieName}=${createSignedWorkspaceCookieValue("workspace-owned")}`,
        },
        body: JSON.stringify({
          email: "gillian@example.com",
          displayName: "Gillian",
        }),
      }),
    );

    const nextWorkspaceCookie = response.cookies.get(workspaceCookieName)?.value ?? null;
    const nextWorkspaceId = readWorkspaceIdFromCookieValue(nextWorkspaceCookie);

    expect(nextWorkspaceId).not.toBeNull();
    expect(nextWorkspaceId).not.toBe("workspace-owned");
    expect(getWorkspaceUser("workspace-owned")?.email).toBe("owner@example.com");
    expect(getWorkspaceUser(nextWorkspaceId ?? "")?.email).toBe("gillian@example.com");
  });
});
