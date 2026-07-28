import { describe, expect, it } from "vitest";

import {
  createSignedWorkspaceCookieValue,
  readWorkspaceIdFromCookieValue,
} from "@/lib/backend/workspace-session";

describe("workspace session signing", () => {
  it("round-trips a signed workspace cookie", () => {
    const signedCookie = createSignedWorkspaceCookieValue("workspace-123");

    expect(readWorkspaceIdFromCookieValue(signedCookie)).toBe("workspace-123");
  });

  it("rejects a tampered signed workspace cookie", () => {
    const signedCookie = createSignedWorkspaceCookieValue("workspace-123");
    const tamperedCookie = `${signedCookie.slice(0, -1)}x`;

    expect(readWorkspaceIdFromCookieValue(tamperedCookie)).toBeNull();
  });
});
