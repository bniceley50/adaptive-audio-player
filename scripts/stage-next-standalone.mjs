import { createHash } from "node:crypto";
import {
  copyFile,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const workerRuntimeFiles = Object.freeze([
  "scripts/job-worker.mjs",
  "scripts/job-worker-lib.mjs",
  "src/lib/backend/audio-storage.ts",
  "src/lib/backend/book-repository.ts",
  "src/lib/backend/database.ts",
  "src/lib/backend/env.ts",
  "src/lib/backend/generation-repository.ts",
  "src/lib/backend/sqlite.ts",
  "src/lib/backend/tts.ts",
  "src/lib/backend/types.ts",
  "src/lib/narration/engines.ts",
  "src/lib/parser/parse-chapters.ts",
]);

const forbiddenCopiedFilePattern = /\.(?:map|spec\.[cm]?[jt]s|test\.[cm]?[jt]s)$/;

const forbiddenStagePaths = [
  /(^|\/)\.git(\/|$)/,
  /(^|\/)\.pnpm(\/|$)/,
  /^data(\/|$)/,
  /^docs(\/|$)/,
  /^tasks(\/|$)/,
  /^tests(\/|$)/,
  /^test-results(\/|$)/,
  /(^|\/)(?:pnpm-lock\.yaml|pnpm-workspace\.yaml)$/,
  forbiddenCopiedFilePattern,
];

function normalizeRelativePath(value) {
  return value.split(path.sep).join("/");
}

function resolveContainedPath(root, relativePath, label) {
  const absoluteRoot = path.resolve(root);
  const candidate = path.resolve(absoluteRoot, relativePath);
  const relative = path.relative(absoluteRoot, candidate);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${label} must stay inside ${absoluteRoot}.`);
  }
  return candidate;
}

async function requireDirectory(directory, label) {
  let details;
  try {
    details = await stat(directory);
  } catch {
    throw new Error(`${label} is missing: ${directory}`);
  }
  if (!details.isDirectory()) {
    throw new Error(`${label} must be a directory: ${directory}`);
  }
}

function findRelativeImports(source) {
  const imports = [];
  const importPattern = /(?:\bfrom\s*|\bimport\s*)["'](\.[^"']+)["']/g;
  for (const match of source.matchAll(importPattern)) {
    imports.push(match[1]);
  }
  if (/\bimport\s*\(/.test(source)) {
    throw new Error("Dynamic imports are not allowed in the staged worker graph.");
  }
  return imports;
}

export async function validateWorkerRuntimeGraph(
  projectRoot,
  runtimeFiles = workerRuntimeFiles,
) {
  const normalizedFiles = new Set(
    runtimeFiles.map((file) => normalizeRelativePath(path.normalize(file))),
  );
  for (const relativeFile of normalizedFiles) {
    const absoluteFile = resolveContainedPath(
      projectRoot,
      relativeFile,
      "Worker runtime file",
    );
    const source = await readFile(absoluteFile, "utf8");
    for (const specifier of findRelativeImports(source)) {
      const importedFile = normalizeRelativePath(
        path.relative(
          projectRoot,
          path.resolve(path.dirname(absoluteFile), specifier),
        ),
      );
      if (!normalizedFiles.has(importedFile)) {
        throw new Error(
          `${relativeFile} imports ${importedFile}, which is not in the worker runtime allowlist.`,
        );
      }
    }
  }
}

async function copyDirectoryContents(source, destination) {
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.name === ".pnpm") {
      continue;
    }
    const sourceEntry = path.join(source, entry.name);
    await cp(sourceEntry, path.join(destination, entry.name), {
      recursive: true,
      errorOnExist: true,
      force: false,
      dereference: true,
      filter: (candidate) => {
        const relativeCandidate = path.relative(sourceEntry, candidate);
        return (
          !relativeCandidate.split(path.sep).includes(".pnpm") &&
          !forbiddenCopiedFilePattern.test(candidate)
        );
      },
    });
  }
}

async function listPayloadFiles(root, current = root) {
  const files = [];
  const entries = await readdir(current, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const absolutePath = path.join(current, entry.name);
    const relativePath = normalizeRelativePath(path.relative(root, absolutePath));
    const details = await lstat(absolutePath);
    if (details.isSymbolicLink()) {
      throw new Error(`Staged payload must not contain symlinks: ${relativePath}`);
    }
    if (details.isDirectory()) {
      files.push(...(await listPayloadFiles(root, absolutePath)));
    } else if (details.isFile()) {
      files.push(relativePath);
    } else {
      throw new Error(`Unsupported staged payload entry: ${relativePath}`);
    }
  }
  return files;
}

async function createFileInventory(root, files) {
  const inventory = [];
  for (const relativePath of [...files].sort()) {
    if (forbiddenStagePaths.some((pattern) => pattern.test(relativePath))) {
      throw new Error(`Forbidden file entered the staged payload: ${relativePath}`);
    }
    const absolutePath = resolveContainedPath(root, relativePath, "Payload file");
    const data = await readFile(absolutePath);
    inventory.push({
      path: relativePath,
      bytes: data.byteLength,
      sha256: createHash("sha256").update(data).digest("hex"),
    });
  }
  return inventory;
}

export async function createStandaloneStage({ projectRoot, outputDirectory }) {
  const absoluteProjectRoot = path.resolve(projectRoot);
  const absoluteOutputDirectory = path.resolve(outputDirectory);
  if (absoluteOutputDirectory === absoluteProjectRoot) {
    throw new Error("The staging directory cannot be the project root.");
  }

  const standaloneRoot = path.join(absoluteProjectRoot, ".next", "standalone");
  const staticRoot = path.join(absoluteProjectRoot, ".next", "static");
  const publicRoot = path.join(absoluteProjectRoot, "public");
  await requireDirectory(standaloneRoot, "Next standalone output");
  await requireDirectory(staticRoot, "Next static output");
  await requireDirectory(publicRoot, "Public asset directory");
  await validateWorkerRuntimeGraph(absoluteProjectRoot);

  await mkdir(path.dirname(absoluteOutputDirectory), { recursive: true });
  await mkdir(absoluteOutputDirectory);
  await copyDirectoryContents(standaloneRoot, absoluteOutputDirectory);
  await copyDirectoryContents(
    path.join(standaloneRoot, "node_modules", ".pnpm", "node_modules"),
    path.join(absoluteOutputDirectory, "node_modules"),
  );
  await copyDirectoryContents(
    staticRoot,
    path.join(absoluteOutputDirectory, ".next", "static"),
  );
  await copyDirectoryContents(publicRoot, path.join(absoluteOutputDirectory, "public"));

  for (const relativeFile of workerRuntimeFiles) {
    const source = resolveContainedPath(
      absoluteProjectRoot,
      relativeFile,
      "Worker runtime file",
    );
    const destination = resolveContainedPath(
      absoluteOutputDirectory,
      relativeFile,
      "Staged worker runtime file",
    );
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }

  const payloadFiles = await listPayloadFiles(absoluteOutputDirectory);
  const inventory = await createFileInventory(
    absoluteOutputDirectory,
    payloadFiles,
  );
  const requiredFiles = ["server.js", ...workerRuntimeFiles];
  for (const requiredFile of requiredFiles) {
    if (!payloadFiles.includes(normalizeRelativePath(requiredFile))) {
      throw new Error(`Required staged file is missing: ${requiredFile}`);
    }
  }
  if (!payloadFiles.some((file) => file.startsWith(".next/static/"))) {
    throw new Error("The staged payload has no Next static assets.");
  }
  if (!payloadFiles.some((file) => file.startsWith("public/"))) {
    throw new Error("The staged payload has no public assets.");
  }

  const manifest = {
    schemaVersion: 1,
    entrypoints: {
      server: "server.js",
      worker: "scripts/job-worker.mjs",
    },
    files: inventory,
  };
  await writeFile(
    path.join(absoluteOutputDirectory, "stage-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--project-root" || argument === "--output") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${argument} requires a path.`);
      }
      options[argument.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptPath)) {
  const options = parseArguments(process.argv.slice(2));
  const projectRoot = path.resolve(
    options["project-root"] ?? fileURLToPath(new URL("..", import.meta.url)),
  );
  const outputDirectory = path.resolve(
    options.output ?? path.join(projectRoot, "build", "next-standalone"),
  );
  createStandaloneStage({ projectRoot, outputDirectory })
    .then((manifest) => {
      process.stdout.write(
        `${JSON.stringify({ outputDirectory, files: manifest.files.length })}\n`,
      );
    })
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
