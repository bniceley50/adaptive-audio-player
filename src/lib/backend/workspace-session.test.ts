import { describe, expect, it } from "vitest";

import {
  createAccountSession,
  getAccountSessionById,
  linkWorkspaceToUser,
  resetDatabaseForTests,
  upsertUserByEmail,
} from "@/lib/backend/sqlite";

import {
  createSignedWorkspaceCookieValue,
  createSignedAccountSession,
  describeSessionLabelFromUserAgent,
  readSignedAccountIdFromCookieValue,
  readSignedAccountSessionFromCookieValue,
  readVerifiedAccountIdFromCookieValue,
  readWorkspaceIdFromCookieValue,
  verifyWorkspaceAccess,
} from "@/lib/backend/workspace-session";

describe("workspace session signing", () => {
  it("round-trips a signed account session", () => {
    const signedCookie = createSignedAccountSession("user-123", "session-123");

    expect(readSignedAccountIdFromCookieValue(signedCookie)).toBe("user-123");
    expect(readSignedAccountSessionFromCookieValue(signedCookie)).toMatchObject({
      accountId: "user-123",
      sessionId: "session-123",
    });
  });

  it("rejects a tampered signed account session", () => {
    const signedCookie = createSignedAccountSession("user-123", "session-123");
    const tamperedCookie = `${signedCookie.slice(0, -1)}x`;

    expect(readSignedAccountIdFromCookieValue(tamperedCookie)).toBeNull();
  });

  it("rejects an expired signed account session", () => {
    const signedCookie = createSignedAccountSession(
      "user-123",
      "session-123",
      0,
    );

    expect(
      readSignedAccountIdFromCookieValue(signedCookie, 31 * 24 * 60 * 60 * 1000),
    ).toBeNull();
  });

  it("describes a browser session from user agent text", () => {
    expect(
      describeSessionLabelFromUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
      ),
    ).toBe("Safari on Mac");
    expect(describeSessionLabelFromUserAgent(null)).toBe("Unknown browser");
  });

  it("revokes an expired persisted session when it is presented", () => {
    resetDatabaseForTests();
    const user = upsertUserByEmail({
      email: "expired-session@example.com",
      displayName: "Expired Session",
    });
    const session = createAccountSession(
      user.id,
      "2000-04-08T12:10:00.000Z",
      "Chrome on Mac",
    );
    const cookie = createSignedAccountSession(
      user.id,
      session?.id ?? "missing-session",
      Date.parse("2000-04-01T12:10:00.000Z"),
    );

    expect(
      readVerifiedAccountIdFromCookieValue(
        cookie,
        Date.parse("2000-04-09T12:10:00.000Z"),
      ),
    ).toBeNull();
    expect(getAccountSessionById(session?.id ?? "")?.revokedAt).not.toBeNull();
  });

  it("round-trips a signed workspace cookie", () => {
    const signedCookie = createSignedWorkspaceCookieValue("workspace-123");

    expect(readWorkspaceIdFromCookieValue(signedCookie)).toBe("workspace-123");
  });

  it("rejects a tampered signed workspace cookie", () => {
    const signedCookie = createSignedWorkspaceCookieValue("workspace-123");
    const tamperedCookie = `${signedCookie.slice(0, -1)}x`;

    expect(readWorkspaceIdFromCookieValue(tamperedCookie)).toBeNull();
  });

  it("requires the owning account for a linked workspace", () => {
    resetDatabaseForTests();
    const user = upsertUserByEmail({
      email: "workspace-owner@example.com",
      displayName: "Workspace Owner",
    });
    linkWorkspaceToUser("workspace-123", user.id);

    expect(verifyWorkspaceAccess("workspace-123", null)).toEqual({
      workspaceId: null,
      error: "Sign in to access this linked workspace.",
    });
    expect(verifyWorkspaceAccess("workspace-123", "user-other")).toEqual({
      workspaceId: null,
      error: "This workspace belongs to another account.",
    });
    expect(verifyWorkspaceAccess("workspace-123", user.id)).toEqual({
      workspaceId: "workspace-123",
      error: null,
    });
  });
});
