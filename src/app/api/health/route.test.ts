import { describe, expect, it } from "vitest";

import { appHealthContract, GET } from "./route";

describe("GET /api/health", () => {
  it("exposes only the versioned application readiness contract", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      component: "adaptive-audio-player-app",
      protocolVersion: 1,
      ready: true,
    });
    expect(Object.keys(appHealthContract).sort()).toEqual([
      "component",
      "protocolVersion",
      "ready",
    ]);
  });
});
