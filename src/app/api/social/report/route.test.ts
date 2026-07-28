import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("social report route", () => {
  it("does not expose a public reporting endpoint", () => {
    const routePath = resolve(
      process.cwd(),
      "src/app/api/social/report/route.ts",
    );

    expect(existsSync(routePath)).toBe(false);
  });
});
