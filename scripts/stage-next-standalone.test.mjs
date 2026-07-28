import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  createStandaloneStage,
  validateWorkerRuntimeGraph,
  workerRuntimeFiles,
} from "./stage-next-standalone.mjs";

const temporaryRoots = [];

async function writeFixture(root, relativePath, contents) {
  const destination = path.join(root, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, contents, "utf8");
}

async function createFixtureProject() {
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "adaptive-audio-stage-test-"),
  );
  temporaryRoots.push(temporaryRoot);
  const projectRoot = path.join(temporaryRoot, "project");
  const outputDirectory = path.join(temporaryRoot, "stage");
  await writeFixture(projectRoot, ".next/standalone/server.js", "server\n");
  await writeFixture(
    projectRoot,
    ".next/standalone/server.js.map",
    "private source paths\n",
  );
  await writeFixture(
    projectRoot,
    ".next/standalone/node_modules/next/runtime.js",
    "runtime\n",
  );
  await writeFixture(
    projectRoot,
    ".next/standalone/node_modules/next/build-diagnostics.test.js",
    "dependency test\n",
  );
  await writeFixture(
    projectRoot,
    ".next/standalone/node_modules/next/dist/docs/guide.md",
    "dependency documentation\n",
  );
  await writeFixture(
    projectRoot,
    ".next/standalone/node_modules/.pnpm/private-store.txt",
    "must not ship\n",
  );
  await writeFixture(
    projectRoot,
    ".next/standalone/node_modules/.pnpm/node_modules/@swc/helpers/index.js",
    "helper\n",
  );
  await writeFixture(projectRoot, ".next/static/chunk.js", "chunk\n");
  await writeFixture(projectRoot, "public/icon.txt", "icon\n");
  for (const runtimeFile of workerRuntimeFiles) {
    await writeFixture(projectRoot, runtimeFile, "export {};\n");
  }
  return { outputDirectory, projectRoot };
}

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("standalone staging", () => {
  it("creates a deterministic, hashed runtime payload outside the project", async () => {
    const { outputDirectory, projectRoot } = await createFixtureProject();

    const manifest = await createStandaloneStage({
      projectRoot,
      outputDirectory,
    });

    expect(manifest.entrypoints).toEqual({
      server: "server.js",
      worker: "scripts/job-worker.mjs",
    });
    expect(manifest.files.map((file) => file.path)).toEqual(
      [...manifest.files.map((file) => file.path)].sort(),
    );
    expect(manifest.files).toContainEqual({
      path: "server.js",
      bytes: 7,
      sha256: "4ad28e4a6461bd64b920f72f86c0d16edc544c4a1f26060518ebb900025d496a",
    });
    await expect(access(path.join(outputDirectory, ".next/static/chunk.js"))).resolves.toBeUndefined();
    await expect(access(path.join(outputDirectory, "public/icon.txt"))).resolves.toBeUndefined();
    await expect(
      access(path.join(outputDirectory, "node_modules/.pnpm/private-store.txt")),
    ).rejects.toThrow();
    await expect(
      access(path.join(outputDirectory, "node_modules/@swc/helpers/index.js")),
    ).resolves.toBeUndefined();
    await expect(access(path.join(outputDirectory, "server.js.map"))).rejects.toThrow();
    await expect(
      access(
        path.join(
          outputDirectory,
          "node_modules/next/build-diagnostics.test.js",
        ),
      ),
    ).rejects.toThrow();
    await expect(
      access(path.join(outputDirectory, "node_modules/next/dist/docs/guide.md")),
    ).resolves.toBeUndefined();
    const writtenManifest = JSON.parse(
      await readFile(path.join(outputDirectory, "stage-manifest.json"), "utf8"),
    );
    expect(writtenManifest).toEqual(manifest);
  });

  it("keeps the real worker graph synchronized with its explicit allowlist", async () => {
    const projectRoot = path.resolve(
      fileURLToPath(new URL("..", import.meta.url)),
    );
    await expect(validateWorkerRuntimeGraph(projectRoot)).resolves.toBeUndefined();
  });

  it("rejects a worker import outside the reviewed runtime allowlist", async () => {
    const { outputDirectory, projectRoot } = await createFixtureProject();
    await writeFixture(
      projectRoot,
      "scripts/job-worker.mjs",
      'import "./unreviewed.mjs";\n',
    );

    await expect(
      createStandaloneStage({ projectRoot, outputDirectory }),
    ).rejects.toThrow("not in the worker runtime allowlist");
  });
});
