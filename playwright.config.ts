import process from "node:process";

import { defineConfig } from "@playwright/test";

const webServerEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && entry[0] !== "NO_COLOR",
  ),
);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
  },
  webServer: {
    command: "pnpm dev:all",
    env: webServerEnv,
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
  },
});
