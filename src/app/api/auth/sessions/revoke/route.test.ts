import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("revoke session route", () => {
  it("does not expose selective account-session revocation", () => {
    const routePath = resolve(
      process.cwd(),
      "src/app/api/auth/sessions/revoke/route.ts",
    );

    expect(existsSync(routePath)).toBe(false);
  });
});
