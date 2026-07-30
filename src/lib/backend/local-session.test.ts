import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { localSessionCookieName as desktopCookieName } from "../../../desktop/supervisor.mjs";

import {
  getLocalSessionBoundaryConfig,
  localSessionCookieName,
  maxLocalRequestBytes,
  verifyLocalSessionRequest,
} from "@/lib/backend/local-session";
import { proxy } from "@/proxy";

const origin = "http://127.0.0.1:3199";
const secret = "a".repeat(64);
const config = { origin, secret };
const rejectedLocalRequests: Array<{
  name: string;
  headers: Record<string, string>;
}> = [
  { name: "missing cookie", headers: { cookie: "" } },
  {
    name: "wrong cookie",
    headers: { cookie: `${localSessionCookieName}=${"b".repeat(64)}` },
  },
  {
    name: "duplicate cookie",
    headers: {
      cookie: `${localSessionCookieName}=${secret}; ${localSessionCookieName}=${secret}`,
    },
  },
  { name: "wrong host", headers: { host: "localhost:3199" } },
];

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(
  path = "/api/books",
  init: RequestInit = {},
) {
  return new Request(`${origin}${path}`, {
    ...init,
    headers: {
      host: "127.0.0.1:3199",
      cookie: `${localSessionCookieName}=${secret}`,
      ...init.headers,
    },
  });
}

describe("packaged local-session boundary configuration", () => {
  it("uses the same cookie protocol as the desktop supervisor", () => {
    expect(desktopCookieName).toBe(localSessionCookieName);
  });

  it("accepts an exact loopback origin and 256-bit hexadecimal secret", () => {
    expect(
      getLocalSessionBoundaryConfig({
        ADAPTIVE_AUDIO_PLAYER_APP_ORIGIN: origin,
        ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET: secret,
        NODE_ENV: "production",
      }),
    ).toEqual(config);
  });

  it("stays inactive only when development has no packaged configuration", () => {
    expect(getLocalSessionBoundaryConfig({ NODE_ENV: "development" })).toBeNull();
    expect(() =>
      getLocalSessionBoundaryConfig({ NODE_ENV: "production" }),
    ).toThrow("must be configured in production");
  });

  it.each([
    {
      ADAPTIVE_AUDIO_PLAYER_APP_ORIGIN: origin,
      NODE_ENV: "production",
    },
    {
      ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET: secret,
      NODE_ENV: "production",
    },
    {
      ADAPTIVE_AUDIO_PLAYER_APP_ORIGIN: "http://0.0.0.0:3199",
      ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET: secret,
      NODE_ENV: "production",
    },
    {
      ADAPTIVE_AUDIO_PLAYER_APP_ORIGIN: origin,
      ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET: "weak-secret",
      NODE_ENV: "production",
    },
  ])("fails closed for partial or unsafe configuration", (environment) => {
    expect(() => getLocalSessionBoundaryConfig(environment)).toThrow();
  });
});

describe("global packaged proxy", () => {
  it("stays transparent outside the packaged runtime", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ADAPTIVE_AUDIO_PLAYER_APP_ORIGIN", "");
    vi.stubEnv("ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET", "");

    const response = proxy(
      new NextRequest("http://127.0.0.1:3100/api/books", {
        headers: { host: "127.0.0.1:3100" },
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("rejects an unrelated local process before route handling", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADAPTIVE_AUDIO_PLAYER_APP_ORIGIN", origin);
    vi.stubEnv("ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET", secret);

    const response = proxy(
      new NextRequest(`${origin}/api/books`, {
        headers: { host: "127.0.0.1:3199" },
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Local application access denied.",
    });
  });

  it("allows the supervisor's exact authenticated readiness request", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADAPTIVE_AUDIO_PLAYER_APP_ORIGIN", origin);
    vi.stubEnv("ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET", secret);

    const response = proxy(
      new NextRequest(origin, {
        headers: {
          host: "127.0.0.1:3199",
          cookie: `${desktopCookieName}=${secret}`,
        },
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("verifyLocalSessionRequest", () => {
  it("accepts the exact host cookie and same-origin mutation", () => {
    expect(verifyLocalSessionRequest(request(), config)).toEqual({ ok: true });
    expect(
      verifyLocalSessionRequest(
        request("/api/books", {
          method: "POST",
          headers: {
            "content-length": "12",
            origin,
          },
        }),
        config,
      ),
    ).toEqual({ ok: true });
  });

  it.each(rejectedLocalRequests)(
    "rejects another local process with $name",
    ({ headers }) => {
      expect(
        verifyLocalSessionRequest(request("/api/books", { headers }), config),
      ).toEqual({ ok: false, code: "forbidden", status: 403 });
    },
  );

  it("rejects cross-origin and origin-less mutations", () => {
    for (const headers of [
      { origin: "https://attacker.example" },
      { origin: "" },
    ]) {
      expect(
        verifyLocalSessionRequest(
          request("/api/books", { method: "POST", headers }),
          config,
        ),
      ).toEqual({ ok: false, code: "forbidden", status: 403 });
    }
  });

  it("rejects unbounded, compressed, malformed, and oversized bodies", () => {
    expect(
      verifyLocalSessionRequest(
        request("/api/books", {
          method: "POST",
          headers: { origin, "transfer-encoding": "chunked" },
        }),
        config,
      ),
    ).toEqual({ ok: false, code: "request-too-large", status: 413 });

    expect(
      verifyLocalSessionRequest(
        request("/api/books", {
          method: "POST",
          headers: { origin, "content-encoding": "gzip" },
        }),
        config,
      ),
    ).toEqual({
      ok: false,
      code: "unsupported-content-encoding",
      status: 415,
    });

    expect(
      verifyLocalSessionRequest(
        request("/api/books", {
          method: "POST",
          headers: { origin, "content-length": "12x" },
        }),
        config,
      ),
    ).toEqual({ ok: false, code: "invalid-request", status: 400 });

    expect(
      verifyLocalSessionRequest(
        request("/api/books", {
          method: "POST",
          headers: {
            origin,
            "content-length": String(maxLocalRequestBytes + 1),
          },
        }),
        config,
      ),
    ).toEqual({ ok: false, code: "request-too-large", status: 413 });
  });
});
