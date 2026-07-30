import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

export const approvedMakeAppxProductVersion = "10.0.26100.7705";
export const proofManifestIdentity = Object.freeze({
  name: "AdaptiveAudioPlayer.UnsignedProof",
  publisher: "CN=Adaptive Audio Player Unsigned Proof",
  version: "0.1.0.0",
  architecture: "x64",
  executable: "AdaptiveAudioPlayer.exe",
});
export const manifestAssetDimensions = Object.freeze({
  "Assets\\Square44x44Logo.png": 44,
  "Assets\\Square150x150Logo.png": 150,
  "Assets\\StoreLogo.png": 50,
});

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const defaultManifestPath = path.join(
  repositoryRoot,
  "desktop",
  "AppxManifest.xml",
);
const defaultMakeAppxPath = path.join(
  process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
  "Windows Kits",
  "10",
  "bin",
  "10.0.26100.0",
  "x64",
  "makeappx.exe",
);
const temporaryDirectoryPrefix = "adaptive-audio-msix-";
const injectedDestinations = new Set([
  "appxmanifest.xml",
  "appxblockmap.xml",
  "appxsignature.p7x",
  "[content_types].xml",
  ...Object.keys(manifestAssetDimensions).map((entry) => entry.toLowerCase()),
]);
const generatedPackageMetadata = new Set([
  "appxblockmap.xml",
  "[content_types].xml",
  "appxmetadata\\codeintegrity.cat",
]);

function usage() {
  return [
    "Usage: node scripts/build-msix.mjs --input <Electron app directory> --output <proof.msix>",
    "       [--makeappx <approved MakeAppx.exe>]",
  ].join("\n");
}

export function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!["--input", "--output", "--makeappx"].includes(argument)) {
      throw new Error(`Unknown argument: ${argument}\n${usage()}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}.\n${usage()}`);
    }
    values[argument.slice(2)] = value;
    index += 1;
  }
  if (!values.input || !values.output) {
    throw new Error(`--input and --output are required.\n${usage()}`);
  }
  return {
    inputDirectory: path.resolve(values.input),
    outputPackage: path.resolve(values.output),
    makeAppxPath: path.resolve(values.makeappx ?? defaultMakeAppxPath),
  };
}

function normalizePackagePath(value) {
  const normalized = value.split(path.sep).join("\\");
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("..\\") ||
    path.win32.isAbsolute(normalized) ||
    /["\r\n]/u.test(normalized)
  ) {
    throw new Error(`Unsafe package-relative path: ${value}`);
  }
  return normalized;
}

async function collectFiles(
  rootDirectory,
  { rejectMetadataCollisions = true } = {},
) {
  const root = path.resolve(rootDirectory);
  const rootDetails = await stat(root).catch(() => null);
  if (!rootDetails?.isDirectory()) {
    throw new Error(`Electron application directory is missing: ${root}`);
  }
  const pending = [root];
  const files = [];
  const destinations = new Set();
  while (pending.length > 0) {
    const current = pending.pop();
    const details = await lstat(current);
    if (details.isSymbolicLink()) {
      throw new Error(`Electron application payload contains a symbolic link: ${current}`);
    }
    if (details.isDirectory()) {
      const entries = await readdir(current);
      for (const entry of entries) pending.push(path.join(current, entry));
      continue;
    }
    if (!details.isFile()) {
      throw new Error(`Electron application payload contains an unsupported entry: ${current}`);
    }
    const destination = normalizePackagePath(path.relative(root, current));
    const key = destination.toLowerCase();
    if (
      rejectMetadataCollisions &&
      (injectedDestinations.has(key) || key.startsWith("assets\\"))
    ) {
      throw new Error(`Electron application payload collides with MSIX metadata: ${destination}`);
    }
    if (destinations.has(key)) {
      throw new Error(`Electron application payload has a case-insensitive collision: ${destination}`);
    }
    destinations.add(key);
    files.push({ source: current, destination, bytes: details.size });
  }
  files.sort((left, right) =>
    left.destination.localeCompare(right.destination, "en", {
      sensitivity: "base",
    }),
  );
  return files;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

export function createProofLogo(size) {
  if (!Number.isInteger(size) || size <= 0 || size > 1024) {
    throw new Error("Logo size must be an integer from 1 through 1024.");
  }
  const stride = 1 + size * 3;
  const pixels = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * stride;
    pixels[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const offset = row + 1 + x * 3;
      const inset = Math.max(2, Math.floor(size * 0.22));
      const isMark = x >= inset && x < size - inset && y >= inset && y < size - inset;
      pixels[offset] = isMark ? 243 : 21;
      pixels[offset + 1] = isMark ? 183 : 50;
      pixels[offset + 2] = isMark ? 65 : 77;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function inspectProofManifest(source) {
  const requireAttribute = (name, expected) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const match = source.match(new RegExp(`${escaped}="([^"]+)"`, "u"));
    if (!match || match[1] !== expected) {
      throw new Error(`AppxManifest.xml must set ${name} to ${expected}.`);
    }
  };
  requireAttribute("Name", proofManifestIdentity.name);
  requireAttribute("Publisher", proofManifestIdentity.publisher);
  requireAttribute("Version", proofManifestIdentity.version);
  requireAttribute("ProcessorArchitecture", proofManifestIdentity.architecture);
  requireAttribute("Executable", proofManifestIdentity.executable);
  requireAttribute("EntryPoint", "Windows.FullTrustApplication");
  if (!source.includes('<rescap:Capability Name="runFullTrust" />')) {
    throw new Error("AppxManifest.xml must declare the runFullTrust capability.");
  }
  for (const destination of Object.keys(manifestAssetDimensions)) {
    if (!source.includes(destination)) {
      throw new Error(`AppxManifest.xml must reference ${destination}.`);
    }
  }
  return proofManifestIdentity;
}

function mappingLine(source, destination) {
  if (/["\r\n]/u.test(source) || /["\r\n]/u.test(destination)) {
    throw new Error("MSIX mapping paths cannot contain quotes or newlines.");
  }
  return `"${source}" "${destination}"`;
}

export async function prepareMsixInputs({
  inputDirectory,
  workingDirectory,
  manifestPath = defaultManifestPath,
}) {
  const applicationFiles = await collectFiles(inputDirectory);
  if (
    !applicationFiles.some(
      (file) =>
        file.destination.toLowerCase() ===
        proofManifestIdentity.executable.toLowerCase(),
    )
  ) {
    throw new Error(
      `Electron application executable is missing: ${proofManifestIdentity.executable}`,
    );
  }
  const manifest = await readFile(manifestPath, "utf8");
  inspectProofManifest(manifest);
  const assetsRoot = path.join(workingDirectory, "Assets");
  await mkdir(assetsRoot, { recursive: true });
  const injectedFiles = [
    { source: manifestPath, destination: "AppxManifest.xml" },
  ];
  for (const [destination, size] of Object.entries(manifestAssetDimensions)) {
    const source = path.join(workingDirectory, ...destination.split("\\"));
    await writeFile(source, createProofLogo(size));
    injectedFiles.push({ source, destination });
  }
  const mappingPath = path.join(workingDirectory, "mapping.txt");
  const mapping = [
    "[Files]",
    ...injectedFiles.map((file) => mappingLine(file.source, file.destination)),
    ...applicationFiles.map((file) =>
      mappingLine(file.source, file.destination),
    ),
    "",
  ].join("\r\n");
  await writeFile(mappingPath, mapping, "utf8");
  return { applicationFiles, injectedFiles, mappingPath };
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else {
        reject(
          new Error(
            `${path.basename(command)} exited with code ${code}: ${stderr || stdout}`,
          ),
        );
      }
    });
  });
}

export async function readWindowsProductVersion(executablePath) {
  if (process.platform !== "win32") {
    throw new Error("The MSIX proof requires Windows x64.");
  }
  const windowsRoot = process.env.SystemRoot ?? "C:\\Windows";
  const powershell = path.join(
    windowsRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const literalPath = executablePath.replaceAll("'", "''");
  const command = [
    `$candidate = '${literalPath}'`,
    "$item = Get-Item -LiteralPath $candidate",
    "$item.VersionInfo.ProductVersion",
  ].join("; ");
  const encodedCommand = Buffer.from(command, "utf16le").toString("base64");
  const result = await run(powershell, [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-EncodedCommand",
    encodedCommand,
  ]);
  return result.stdout.trim();
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const input = createReadStream(filePath);
    input.on("data", (chunk) => hash.update(chunk));
    input.once("error", reject);
    input.once("end", resolve);
  });
  return hash.digest("hex");
}

async function verifyUnpackedPayload({
  unpackedDirectory,
  applicationFiles,
  injectedFiles,
  manifestPath,
}) {
  const unpackedFiles = await collectFiles(unpackedDirectory, {
    rejectMetadataCollisions: false,
  });
  const byDestination = new Map(
    unpackedFiles.map((file) => [file.destination.toLowerCase(), file]),
  );
  if (byDestination.has("appxsignature.p7x")) {
    throw new Error("Unsigned proof unexpectedly contains AppxSignature.p7x.");
  }
  const expectedDestinations = new Set([
    ...applicationFiles.map((file) => file.destination.toLowerCase()),
    ...injectedFiles.map((file) => file.destination.toLowerCase()),
  ]);
  const actualPayloadDestinations = new Set(
    unpackedFiles
      .map((file) => file.destination.toLowerCase())
      .filter((destination) => !generatedPackageMetadata.has(destination)),
  );
  if (
    expectedDestinations.size !== actualPayloadDestinations.size ||
    [...expectedDestinations].some(
      (destination) => !actualPayloadDestinations.has(destination),
    )
  ) {
    throw new Error("Unpacked MSIX payload does not exactly match the mapped application payload.");
  }
  for (const sourceFile of applicationFiles) {
    const unpacked = byDestination.get(sourceFile.destination.toLowerCase());
    if (!unpacked || unpacked.bytes !== sourceFile.bytes) {
      throw new Error(`Unpacked MSIX file size differs: ${sourceFile.destination}`);
    }
  }
  const unpackedManifestPath = path.join(
    unpackedDirectory,
    "AppxManifest.xml",
  );
  const [sourceManifest, unpackedManifest] = await Promise.all([
    readFile(manifestPath),
    readFile(unpackedManifestPath),
  ]);
  if (!sourceManifest.equals(unpackedManifest)) {
    throw new Error("MakeAppx changed the proof manifest unexpectedly.");
  }
  return { unpackedFiles: unpackedFiles.length, unsigned: true };
}

function assertSafeTemporaryDirectory(directory) {
  const resolved = path.resolve(directory);
  const temporaryRoot = path.resolve(tmpdir());
  if (
    path.dirname(resolved) !== temporaryRoot ||
    !path.basename(resolved).startsWith(temporaryDirectoryPrefix)
  ) {
    throw new Error(`Refusing to remove an unowned temporary directory: ${resolved}`);
  }
  return resolved;
}

export async function buildUnsignedMsix({
  inputDirectory,
  outputPackage,
  makeAppxPath = defaultMakeAppxPath,
  manifestPath = defaultManifestPath,
}) {
  const input = path.resolve(inputDirectory);
  const output = path.resolve(outputPackage);
  const makeAppx = path.resolve(makeAppxPath);
  if (path.extname(output).toLowerCase() !== ".msix") {
    throw new Error("Unsigned proof output must use the .msix extension.");
  }
  if (existsSync(output)) {
    throw new Error(`Unsigned proof output must not already exist: ${output}`);
  }
  const makeAppxDetails = await stat(makeAppx).catch(() => null);
  if (!makeAppxDetails?.isFile()) {
    throw new Error(`Approved MakeAppx.exe is missing: ${makeAppx}`);
  }
  const productVersion = await readWindowsProductVersion(makeAppx);
  if (productVersion !== approvedMakeAppxProductVersion) {
    throw new Error(
      `MakeAppx.exe product version must be ${approvedMakeAppxProductVersion}; received ${productVersion}.`,
    );
  }
  await mkdir(path.dirname(output), { recursive: true });
  const workingDirectory = await mkdtemp(
    path.join(tmpdir(), temporaryDirectoryPrefix),
  );
  try {
    const prepared = await prepareMsixInputs({
      inputDirectory: input,
      workingDirectory,
      manifestPath,
    });
    await run(makeAppx, [
      "pack",
      "/f",
      prepared.mappingPath,
      "/p",
      output,
      "/h",
      "SHA256",
      "/no",
    ]);
    const unpackedDirectory = path.join(workingDirectory, "unpacked");
    await run(makeAppx, [
      "unpack",
      "/p",
      output,
      "/d",
      unpackedDirectory,
      "/no",
    ]);
    const verified = await verifyUnpackedPayload({
      unpackedDirectory,
      applicationFiles: prepared.applicationFiles,
      injectedFiles: prepared.injectedFiles,
      manifestPath,
    });
    const outputDetails = await stat(output);
    return {
      outputPackage: output,
      packageBytes: outputDetails.size,
      packageSha256: await sha256File(output),
      sourceFiles: prepared.applicationFiles.length,
      sourceBytes: prepared.applicationFiles.reduce(
        (total, file) => total + file.bytes,
        0,
      ),
      unpackedFiles: verified.unpackedFiles,
      unsigned: verified.unsigned,
      identity: proofManifestIdentity,
      makeAppxProductVersion: productVersion,
    };
  } catch (error) {
    if (existsSync(output)) await rm(output, { force: true });
    throw error;
  } finally {
    await rm(assertSafeTemporaryDirectory(workingDirectory), {
      force: true,
      recursive: true,
    });
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
  if (options) {
    buildUnsignedMsix(options)
      .then((result) => {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      })
      .catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
        process.exitCode = 1;
      });
  }
}
