import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("account route", () => {
  it("does not expose an email-only authentication route", () => {
    const routePath = resolve(
      process.cwd(),
      "src/app/api/auth/account/route.ts",
    );

    expect(existsSync(routePath)).toBe(false);
  });
});
