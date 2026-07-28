import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("social moderation route", () => {
  it("does not expose a public moderation endpoint", () => {
    const routePath = resolve(
      process.cwd(),
      "src/app/api/social/moderation/route.ts",
    );

    expect(existsSync(routePath)).toBe(false);
  });
});
