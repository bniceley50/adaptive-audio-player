import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("retired jobs dashboard", () => {
  it("does not expose operational queue and worker state as a customer page", () => {
    const pagePath = resolve(process.cwd(), "src/app/jobs/page.tsx");

    expect(existsSync(pagePath)).toBe(false);
  });
});
