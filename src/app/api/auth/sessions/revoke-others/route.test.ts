import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("revoke other sessions route", () => {
  it("does not expose bulk account-session revocation", () => {
    const routePath = resolve(
      process.cwd(),
      "src/app/api/auth/sessions/revoke-others/route.ts",
    );

    expect(existsSync(routePath)).toBe(false);
  });
});
