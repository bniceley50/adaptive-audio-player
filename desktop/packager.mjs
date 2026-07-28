import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  cp,
  lstat,
  mkdir,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { packager } from "@electron/packager";

export const electronVersion = "43.1.1";
export const electronZipName = `electron-v${electronVersion}-win32-x64.zip`;
export const electronZipSha256 =
  "b4e9995cd3f65785eb8818276aa9020f3165ab11da41b3c762616d4a0ad8c7ad";
const kokoroRevision = "f3ff3571791e39611d31c381e3a41a3af07b4987";

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function verifyElectronZip(electronZipDirectory) {
  const zipPath = path.join(path.resolve(electronZipDirectory), electronZipName);
  const details = await stat(zipPath).catch(() => null);
  if (!details?.isFile()) {
    throw new Error(`Approved Electron ZIP is missing: ${zipPath}`);
  }
  const actualHash = await hashFile(zipPath);
  if (actualHash !== electronZipSha256) {
    throw new Error(
      `Electron ZIP SHA-256 mismatch: expected ${electronZipSha256}, received ${actualHash}.`,
    );
  }
  return zipPath;
}

export function createPackagerOptions({
  inputDirectory,
  outputDirectory,
  electronZipDirectory,
  runtimeDirectory,
}) {
  if (!runtimeDirectory) {
    throw new Error("A prepared runtime directory is required.");
  }
  return {
    dir: path.resolve(inputDirectory),
    out: path.resolve(outputDirectory),
    name: "Adaptive Audio Player",
    executableName: "AdaptiveAudioPlayer",
    appVersion: "0.1.0",
    electronVersion,
    electronZipDir: path.resolve(electronZipDirectory),
    extraResource: [path.resolve(runtimeDirectory)],
    platform: "win32",
    arch: "x64",
    asar: true,
    overwrite: false,
    prune: false,
    quiet: false,
    win32metadata: {
      CompanyName: "Adaptive Audio Player",
      FileDescription: "Adaptive Audio Player",
      InternalName: "AdaptiveAudioPlayer",
      OriginalFilename: "AdaptiveAudioPlayer.exe",
      ProductName: "Adaptive Audio Player",
    },
  };
}

export async function prepareElectronShellSource({
  inputDirectory,
  mainEntry = fileURLToPath(new URL("./main.mjs", import.meta.url)),
  supervisorEntry = fileURLToPath(
    new URL("./supervisor.mjs", import.meta.url),
  ),
}) {
  const absoluteInput = path.resolve(inputDirectory);
  await mkdir(path.dirname(absoluteInput), { recursive: true });
  await mkdir(absoluteInput);
  await copyFile(mainEntry, path.join(absoluteInput, "main.mjs"));
  await copyFile(supervisorEntry, path.join(absoluteInput, "supervisor.mjs"));
  const packageManifest = {
    name: "adaptive-audio-player-desktop",
    productName: "Adaptive Audio Player",
    version: "0.1.0",
    private: true,
    type: "module",
    main: "main.mjs",
  };
  await writeFile(
    path.join(absoluteInput, "package.json"),
    `${JSON.stringify(packageManifest, null, 2)}\n`,
    "utf8",
  );
  return packageManifest;
}

async function requireFile(filePath, label) {
  const details = await stat(filePath).catch(() => null);
  if (!details?.isFile()) {
    throw new Error(`${label} is missing: ${filePath}`);
  }
}

async function requireDirectory(directory, label) {
  const details = await stat(directory).catch(() => null);
  if (!details?.isDirectory()) {
    throw new Error(`${label} is missing: ${directory}`);
  }
}

async function rejectSymlinks(root, label) {
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    const details = await lstat(current);
    if (details.isSymbolicLink()) {
      throw new Error(`${label} contains a symbolic link: ${current}`);
    }
    if (!details.isDirectory()) {
      continue;
    }
    for (const entry of await readdir(current)) {
      pending.push(path.join(current, entry));
    }
  }
}

export async function prepareRuntimeResources({
  runtimeDirectory,
  nodeRuntimeDirectory,
  appStageDirectory,
  sidecarDirectory,
}) {
  const runtimeRoot = path.resolve(runtimeDirectory);
  const nodeSource = path.resolve(nodeRuntimeDirectory);
  const appSource = path.resolve(appStageDirectory);
  const sidecarSource = path.resolve(sidecarDirectory);
  if (await stat(runtimeRoot).catch(() => null)) {
    throw new Error(`Runtime directory must not already exist: ${runtimeRoot}`);
  }

  await requireDirectory(nodeSource, "Pinned Node runtime");
  await requireFile(path.join(nodeSource, "node.exe"), "Pinned Node executable");
  await requireFile(path.join(nodeSource, "LICENSE"), "Pinned Node license");
  await requireDirectory(appSource, "Standalone application stage");
  for (const relativeName of [
    "server.js",
    "scripts/job-worker.mjs",
    "stage-manifest.json",
  ]) {
    await requireFile(
      path.join(appSource, relativeName),
      `Standalone application ${relativeName}`,
    );
  }
  await requireDirectory(sidecarSource, "Frozen TTS sidecar");
  await requireFile(
    path.join(sidecarSource, "AdaptiveAudioPlayerTTS.exe"),
    "Frozen TTS executable",
  );
  const modelRoot = path.join(
    sidecarSource,
    "_internal",
    "models",
    "kokoro",
    kokoroRevision,
  );
  for (const relativeName of [
    "kokoro-v1_0.pth",
    "config.json",
    "voices/af_heart.pt",
    "voices/af_bella.pt",
    "voices/am_michael.pt",
  ]) {
    await requireFile(
      path.join(modelRoot, relativeName),
      `Frozen model resource ${relativeName}`,
    );
  }
  await rejectSymlinks(nodeSource, "Pinned Node runtime");
  await rejectSymlinks(appSource, "Standalone application stage");
  await rejectSymlinks(sidecarSource, "Frozen TTS sidecar");

  await mkdir(runtimeRoot, { recursive: true });
  const nodeDestination = path.join(runtimeRoot, "node");
  await mkdir(nodeDestination);
  await copyFile(
    path.join(nodeSource, "node.exe"),
    path.join(nodeDestination, "node.exe"),
  );
  await copyFile(
    path.join(nodeSource, "LICENSE"),
    path.join(nodeDestination, "LICENSE"),
  );
  await cp(appSource, path.join(runtimeRoot, "app"), {
    errorOnExist: true,
    force: false,
    recursive: true,
  });
  await cp(sidecarSource, path.join(runtimeRoot, "tts"), {
    errorOnExist: true,
    force: false,
    recursive: true,
  });
  return {
    runtimeRoot,
    nodeExecutable: path.join(runtimeRoot, "node", "node.exe"),
    serverEntry: path.join(runtimeRoot, "app", "server.js"),
    workerEntry: path.join(runtimeRoot, "app", "scripts", "job-worker.mjs"),
    sidecarExecutable: path.join(
      runtimeRoot,
      "tts",
      "AdaptiveAudioPlayerTTS.exe",
    ),
  };
}

export async function packageElectronShell({
  inputDirectory,
  outputDirectory,
  electronZipDirectory,
  runtimeDirectory,
  nodeRuntimeDirectory,
  appStageDirectory,
  sidecarDirectory,
}) {
  await verifyElectronZip(electronZipDirectory);
  await prepareElectronShellSource({ inputDirectory });
  await prepareRuntimeResources({
    runtimeDirectory,
    nodeRuntimeDirectory,
    appStageDirectory,
    sidecarDirectory,
  });
  const bundlePaths = await packager(
    createPackagerOptions({
      inputDirectory,
      outputDirectory,
      electronZipDirectory,
      runtimeDirectory,
    }),
  );
  if (bundlePaths.length !== 1) {
    throw new Error(`Expected one Electron bundle, received ${bundlePaths.length}.`);
  }
  return bundlePaths[0];
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (
      [
        "--input",
        "--output",
        "--electron-zip-dir",
        "--runtime",
        "--node-runtime",
        "--app-stage",
        "--sidecar",
      ].includes(argument)
    ) {
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
  for (const name of [
    "input",
    "output",
    "electron-zip-dir",
    "runtime",
    "node-runtime",
    "app-stage",
    "sidecar",
  ]) {
    if (!options[name]) {
      throw new Error(`--${name} is required.`);
    }
  }
  return options;
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptPath)) {
  const options = parseArguments(process.argv.slice(2));
  try {
    const bundlePath = await packageElectronShell({
      inputDirectory: options.input,
      outputDirectory: options.output,
      electronZipDirectory: options["electron-zip-dir"],
      runtimeDirectory: options.runtime,
      nodeRuntimeDirectory: options["node-runtime"],
      appStageDirectory: options["app-stage"],
      sidecarDirectory: options.sidecar,
    });
    process.stdout.write(`${JSON.stringify({ bundlePath })}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
