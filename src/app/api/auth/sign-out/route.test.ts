import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("sign out route", () => {
  it("does not expose account-session sign out", () => {
    const routePath = resolve(
      process.cwd(),
      "src/app/api/auth/sign-out/route.ts",
    );

    expect(existsSync(routePath)).toBe(false);
  });
});
