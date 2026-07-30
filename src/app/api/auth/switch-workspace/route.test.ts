import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("switch workspace route", () => {
  it("does not expose account-linked workspace switching", () => {
    const routePath = resolve(
      process.cwd(),
      "src/app/api/auth/switch-workspace/route.ts",
    );

    expect(existsSync(routePath)).toBe(false);
  });
});
