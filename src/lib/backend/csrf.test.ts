import { describe, expect, it } from "vitest";

import { verifySameOriginMutation } from "@/lib/backend/csrf";

describe("verifySameOriginMutation", () => {
  it("allows same-origin requests by origin header", () => {
    const request = new Request("http://127.0.0.1:3100/api/auth/account", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3100",
        origin: "http://127.0.0.1:3100",
      },
    });

    expect(verifySameOriginMutation(request)).toBeNull();
  });

  it("allows same-origin requests by referer when origin is missing", () => {
    const request = new Request("http://127.0.0.1:3100/api/auth/account", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3100",
        referer: "http://127.0.0.1:3100/",
      },
    });

    expect(verifySameOriginMutation(request)).toBeNull();
  });

  it("rejects cross-site requests", async () => {
    const request = new Request("http://127.0.0.1:3100/api/auth/account", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3100",
        origin: "https://evil.example",
      },
    });

    const response = verifySameOriginMutation(request);
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: "Cross-site requests are not allowed.",
    });
  });
});
