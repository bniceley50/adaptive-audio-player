import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const reviewedSourceHashes = Object.freeze({
  "pnpm-lock.yaml":
    "c1595e408eddfb60be8def3a461d56267ea2e3846a62d3f8dcbf817f40b72d2a",
  "tts_sidecar/requirements-build.txt":
    "7bd5441196cbad237e88e0bab09beb64a1d707913a4f0f7ae43d2f25e0139392",
  "tts_sidecar/requirements.txt":
    "92e3aab53af345c46afaba5a1e6d1c199edec6b9b5aa2de45503d46ea7ec6323",
});

const reviewedVersions = Object.freeze({
  application: "0.1.0",
  electron: "43.1.1",
  electronFuses: "2.1.3",
  electronPackager: "20.0.0",
  libsndfile: "1.2.2",
  node: "22.23.1",
  pyinstaller: "6.21.0",
  python: "3.12.10",
  windowsSdk: "10.0.26100.7705",
  zipJs: "2.8.31",
});

const reviewedBinaryHashes = Object.freeze({
  espeak:
    "646d387acbc7ac2aa45e3625aa00a6835ae5d446ff8b0748298c3900b4dde258",
  libsndfile:
    "22518c16f9d13eda5ae5adf999c4740d7d16cc2d6b178b36dd4ac2f759a38559",
  python:
    "9a0e3435aaa680d868150f87ab3e388ad2eebc22f87e036155c7b4eda8cd2120",
});

const kokoroRevision = "f3ff3571791e39611d31c381e3a41a3af07b4987";
const reviewedModelFiles = Object.freeze({
  "config.json":
    "5abb01e2403b072bf03d04fde160443e209d7a0dad49a423be15196b9b43c17f",
  "kokoro-v1_0.pth":
    "496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4",
  "voices/af_bella.pt":
    "8cb64e02fcc8de0327a8e13817e49c76c945ecf0052ceac97d3081480e8e48d6",
  "voices/af_heart.pt":
    "0ab5709b8ffab19bfd849cd11d98f75b60af7733253ad0d67b12382a102cb4ff",
  "voices/am_michael.pt":
    "9a443b79a4b22489a5b0ab7c651a0bcd1a30bef675c28333f06971abbd47bd37",
});

const reviewedMicrosoftRuntimeFiles = Object.freeze({
  "MSVCP140_ATOMIC_WAIT.dll": {
    hash: "e7963645e0d1db08e300614d4c5fa7194bd8173e9ab7a5558859e6b232ed3241",
    license: "Microsoft Visual C++ Runtime terms",
    version: "14.50.35719.0",
  },
  "msvcp140.dll": {
    hash: "b5e0f2a76b5e2bfa9aa8bf3bc385303eb1554959eb5722bdfb0f3fe995ce579a",
    license: "Microsoft Visual C++ Runtime terms",
    version: "14.44.35208.0",
  },
  "numpy.libs/msvcp140-a4c2229bdc2a2a630acdc095b4d86008.dll": {
    hash: "a4c2229bdc2a2a630acdc095b4d86008e5c3e3bc7773174354f3da4f5beb9cde",
    license: "Microsoft Visual C++ Runtime terms",
    version: "14.40.33810.0",
  },
  "ucrtbase.dll": {
    hash: "6dea28951eb6c593dafb26dc69e499ae283a939f46e3a00690dbcca954ce10ea",
    license: "Microsoft Windows SDK terms",
    version: "10.0.22621.5040",
  },
  "vcruntime140.dll": {
    hash: "e3b0b0dd4c8951a4f48b644fdb74c5ebcf7085424722cfae0b0bc5f4873cc788",
    license: "Microsoft Visual C++ Runtime terms",
    version: "14.44.35208.0",
  },
  "vcruntime140_1.dll": {
    hash: "33053dec8e97cf3353d44e8c7402db082458c786c0aa91414fc26debfb38b1c5",
    license: "Microsoft Visual C++ Runtime terms",
    version: "14.44.35208.0",
  },
});

const reviewedProjectAssets = Object.freeze({
  "demo-audio/the-adventures-of-sherlock-holmes-ch01.mp3":
    "4e4e6840eda41495665b1d35efbfe8edccb3fb4dc7fa00d23e86be6a77c06b9e",
});

const knownSpdxIdentifiers = new Set([
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BSL-1.0",
  "CC0-1.0",
  "CNRI-Python",
  "GPL-2.0-only",
  "GPL-3.0-or-later",
  "ISC",
  "LGPL-2.1-or-later",
  "LGPL-3.0-or-later",
  "LLVM-exception",
  "MIT",
  "MIT-0",
  "MPL-2.0",
  "PSF-2.0",
  "Unlicense",
  "Zlib",
]);

const classifierLicenses = Object.freeze([
  ["GNU Lesser General Public License", "LGPL-2.1-or-later"],
  ["GNU General Public License v3 or later", "GPL-3.0-or-later"],
  ["Mozilla Public License 2.0", "MPL-2.0"],
  ["Apache Software License", "Apache-2.0"],
  ["BSD License", "BSD-3-Clause"],
  ["ISC License", "ISC"],
  ["MIT License", "MIT"],
  ["Python Software Foundation License", "PSF-2.0"],
]);

const rawLicenseAliases = new Map([
  ["Apache 2.0", "Apache-2.0"],
  ["Apache 2.0 License", "Apache-2.0"],
  ["BSD", "BSD-3-Clause"],
  ["BSD 3-Clause License", "BSD-3-Clause"],
  ["BSD 3-Clause OR Apache-2.0", "BSD-3-Clause OR Apache-2.0"],
  ["Dual License", "BSD-3-Clause OR Apache-2.0"],
  ["ISC License", "ISC"],
  ["LGPL", "LGPL-2.1-or-later"],
  ["MIT license", "MIT"],
  ["UNKNOWN", null],
]);

const missingNodePackageLicenses = new Map([
  ["babel-packages", "MIT"],
  ["busboy", "MIT"],
  ["constants-browserify", "MIT"],
  ["ignore-loader", "MIT"],
  ["querystring-es3", "MIT"],
  ["react-builtin", "MIT"],
  ["react-dom-builtin", "MIT"],
  ["react-dom-experimental-builtin", "MIT"],
  ["react-experimental-builtin", "MIT"],
  ["react-server-dom-turbopack-builtin", "MIT"],
  ["react-server-dom-turbopack-experimental-builtin", "MIT"],
  ["react-server-dom-webpack-builtin", "MIT"],
  ["react-server-dom-webpack-experimental-builtin", "MIT"],
  ["scheduler-builtin", "MIT"],
  ["scheduler-experimental-builtin", "MIT"],
]);

const mediaExtensions = new Set([
  ".aac",
  ".flac",
  ".m4a",
  ".mp3",
  ".ogg",
  ".otf",
  ".ttf",
  ".wav",
  ".woff",
  ".woff2",
]);

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function normalizePythonName(name) {
  return name.toLowerCase().replaceAll(/[-_.]+/g, "-");
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

async function sha256File(filePath) {
  return sha256(await readFile(filePath));
}

async function requireRegularFile(filePath, label) {
  const stats = await lstat(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file: ${filePath}`);
  }
}

async function requireDirectory(directoryPath, label) {
  const stats = await lstat(directoryPath);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory: ${directoryPath}`);
  }
}

async function walkFiles(root) {
  const result = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Release inventory rejects symbolic links: ${absolutePath}`);
      }
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        result.push(absolutePath);
      }
    }
  }
  await visit(root);
  return result;
}

export function parseRequirementsLock(contents) {
  const requirements = [];
  const logicalLines = contents.replaceAll(/\\\r?\n\s*/g, " ").split(/\r?\n/);
  for (const originalLine of logicalLines) {
    const line = originalLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("--")) {
      continue;
    }
    const hashMatch = line.match(/--hash=sha256:([a-f0-9]{64})/i);
    if (!hashMatch) {
      throw new Error(`Requirement is missing one SHA-256 hash: ${line}`);
    }
    const requirement = line.split(/\s+--hash=/)[0].trim();
    let name;
    let version;
    const directMatch = requirement.match(
      /^([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?\s+@\s+.+[-_]([0-9][A-Za-z0-9_.-]*)-py/i,
    );
    const pinnedMatch = requirement.match(
      /^([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?==([^\s]+)$/,
    );
    if (directMatch) {
      [, name, version] = directMatch;
    } else if (pinnedMatch) {
      [, name, version] = pinnedMatch;
    } else {
      throw new Error(`Requirement is not exact: ${requirement}`);
    }
    requirements.push({
      hash: hashMatch[1].toLowerCase(),
      name,
      normalizedName: normalizePythonName(name),
      version: version.replaceAll("_", "."),
    });
  }
  const names = requirements.map((item) => item.normalizedName);
  if (new Set(names).size !== names.length) {
    throw new Error("Requirements lock contains a duplicate distribution");
  }
  return requirements.sort((left, right) =>
    left.normalizedName.localeCompare(right.normalizedName),
  );
}

function parseMetadata(contents) {
  const headers = new Map();
  let currentName;
  for (const line of contents.split(/\r?\n/)) {
    if (/^\s/.test(line) && currentName) {
      const values = headers.get(currentName);
      values[values.length - 1] += `\n${line.trim()}`;
      continue;
    }
    const separator = line.indexOf(":");
    if (separator === -1) {
      if (!line) {
        break;
      }
      continue;
    }
    currentName = line.slice(0, separator).toLowerCase();
    const value = line.slice(separator + 1).trim();
    const values = headers.get(currentName) ?? [];
    values.push(value);
    headers.set(currentName, values);
  }
  return {
    all(name) {
      return headers.get(name.toLowerCase()) ?? [];
    },
    first(name) {
      return this.all(name)[0];
    },
  };
}

function assertKnownSpdxExpression(expression, componentName) {
  const identifiers = expression
    .replaceAll(/[()]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !["AND", "OR", "WITH"].includes(token));
  const unknown = identifiers.filter(
    (identifier) => !knownSpdxIdentifiers.has(identifier),
  );
  if (unknown.length > 0) {
    throw new Error(
      `${componentName} has an unreviewed license identifier: ${unknown.join(", ")}`,
    );
  }
  return expression;
}

export function resolvePythonLicense(metadata) {
  const componentName = metadata.first("Name") ?? "Python distribution";
  const expression = metadata.first("License-Expression");
  if (expression) {
    return assertKnownSpdxExpression(expression, componentName);
  }
  if (normalizePythonName(componentName) === "espeakng-loader") {
    return "MIT";
  }
  const rawLicense = metadata.first("License");
  if (rawLicense && rawLicenseAliases.has(rawLicense)) {
    const alias = rawLicenseAliases.get(rawLicense);
    if (alias) {
      return alias;
    }
  }
  if (rawLicense && knownSpdxIdentifiers.has(rawLicense)) {
    return rawLicense;
  }
  if (
    rawLicense &&
    rawLicense.length < 256 &&
    !rawLicense.includes("\n") &&
    /\b(?:AND|OR|WITH)\b/.test(rawLicense)
  ) {
    return assertKnownSpdxExpression(rawLicense, componentName);
  }
  if (rawLicense?.includes("Version 2.0, January 2004")) {
    return "Apache-2.0";
  }
  if (
    rawLicense?.includes("GNU GENERAL PUBLIC LICENSE") &&
    rawLicense.includes("Version 3")
  ) {
    return "GPL-3.0-or-later";
  }
  const classifiers = metadata.all("Classifier").join("\n");
  for (const [needle, license] of classifierLicenses) {
    if (classifiers.includes(needle)) {
      return license;
    }
  }
  throw new Error(`${componentName} has an unknown or missing license`);
}

function resolveNodeLicense(manifest) {
  const rawLicense =
    typeof manifest.license === "string"
      ? manifest.license
      : manifest.license?.type;
  const license =
    rawLicenseAliases.get(rawLicense) ??
    rawLicense ??
    missingNodePackageLicenses.get(manifest.name);
  if (!license) {
    throw new Error(`${manifest.name}@${manifest.version} has no reviewed license`);
  }
  return assertKnownSpdxExpression(license, manifest.name);
}

async function verifyHash(filePath, expected, label) {
  await requireRegularFile(filePath, label);
  const actual = await sha256File(filePath);
  if (actual !== expected) {
    throw new Error(
      `${label} SHA-256 drifted: expected ${expected}, received ${actual}`,
    );
  }
  return actual;
}

export async function validateSourceLocks(root = repositoryRoot) {
  for (const [relativePath, expectedHash] of Object.entries(
    reviewedSourceHashes,
  )) {
    await verifyHash(
      path.join(root, ...relativePath.split("/")),
      expectedHash,
      relativePath,
    );
  }
  const packageManifest = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  const expectedPackages = {
    "@electron/fuses": reviewedVersions.electronFuses,
    "@electron/packager": reviewedVersions.electronPackager,
    "@zip.js/zip.js": reviewedVersions.zipJs,
    electron: reviewedVersions.electron,
  };
  const declaredPackages = {
    ...packageManifest.dependencies,
    ...packageManifest.devDependencies,
  };
  for (const [name, version] of Object.entries(expectedPackages)) {
    if (declaredPackages[name] !== version) {
      throw new Error(
        `${name} drifted: expected ${version}, received ${declaredPackages[name]}`,
      );
    }
  }
  if (packageManifest.version !== reviewedVersions.application) {
    throw new Error("Application version drifted from the reviewed inventory");
  }
  const runtimeLock = parseRequirementsLock(
    await readFile(path.join(root, "tts_sidecar", "requirements.txt"), "utf8"),
  );
  const buildLock = parseRequirementsLock(
    await readFile(
      path.join(root, "tts_sidecar", "requirements-build.txt"),
      "utf8",
    ),
  );
  const pyinstaller = buildLock.find(
    (item) => item.normalizedName === "pyinstaller",
  );
  if (
    pyinstaller?.version !== reviewedVersions.pyinstaller ||
    pyinstaller.hash !==
      "7fae06c494ce0ebfe6bd3055c0e409def884f63af2e3705d06bd431ad9237fc7"
  ) {
    throw new Error("PyInstaller pin drifted from the approved build policy");
  }
  return { buildLock, packageManifest, runtimeLock };
}

function makeLicense(license) {
  if (knownSpdxIdentifiers.has(license)) {
    return { expression: license };
  }
  if (/\b(?:AND|OR|WITH)\b/.test(license)) {
    const identifiers = license
      .replaceAll(/[()]/g, " ")
      .split(/\s+/)
      .filter((token) => token && !["AND", "OR", "WITH"].includes(token));
    if (
      identifiers.length > 0 &&
      identifiers.every((identifier) => knownSpdxIdentifiers.has(identifier))
    ) {
      return { expression: license };
    }
  }
  return { license: { name: license } };
}

function makeComponent({
  group,
  hash,
  license,
  location,
  name,
  scope,
  type = "library",
  version,
}) {
  if (!license || /unknown|noassertion/i.test(license)) {
    throw new Error(`${name} has an unacceptable license value: ${license}`);
  }
  const identity = [type, name, version ?? "", license].join("|");
  const properties = [];
  if (group) {
    properties.push({ name: "adaptive-audio-player:group", value: group });
  }
  if (location) {
    properties.push({
      name: "adaptive-audio-player:packaged-path",
      value: toPosix(location),
    });
  }
  const component = {
    "bom-ref": `component-${sha256(identity).slice(0, 24)}`,
    type,
    name,
    licenses: [makeLicense(license)],
  };
  if (version) {
    component.version = version;
  }
  if (scope) {
    component.scope = scope;
  }
  if (hash) {
    component.hashes = [{ alg: "SHA-256", content: hash }];
  }
  if (properties.length > 0) {
    component.properties = properties;
  }
  return component;
}

function componentLicense(component) {
  const entry = component.licenses[0];
  return entry.expression ?? entry.license.name;
}

function componentGroup(component) {
  return (
    component.properties?.find(
      (property) => property.name === "adaptive-audio-player:group",
    )?.value ?? "Other"
  );
}

function mergeComponents(components) {
  const byIdentity = new Map();
  for (const component of components) {
    const existing = byIdentity.get(component["bom-ref"]);
    if (!existing) {
      byIdentity.set(component["bom-ref"], component);
      continue;
    }
    const locations = [
      ...(existing.properties ?? []),
      ...(component.properties ?? []),
    ].filter(
      (property) =>
        property.name !== "adaptive-audio-player:packaged-path" ||
        !(existing.properties ?? []).some(
          (candidate) =>
            candidate.name === property.name &&
            candidate.value === property.value,
        ),
    );
    existing.properties = locations;
  }
  return [...byIdentity.values()].sort((left, right) =>
    left["bom-ref"].localeCompare(right["bom-ref"]),
  );
}

function packageIsCompiled(relativePath) {
  return toPosix(relativePath).includes(
    "node_modules/next/dist/compiled/",
  );
}

function packageIsIgnored(relativePath) {
  const portablePath = toPosix(relativePath);
  return (
    portablePath === "package.json" ||
    portablePath === ".next/package.json" ||
    portablePath.includes("node_modules/@swc/helpers/_/") ||
    portablePath.endsWith(
      "/node_modules/next/dist/compiled/@babel/runtime/helpers/esm/package.json",
    )
  );
}

function lockContainsPackage(lockContents, name, version) {
  const escaped = `${name}@${version}`.replaceAll(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  return new RegExp(`^\\s{2}['\"]?${escaped}['\"]?:`, "m").test(lockContents);
}

async function inventoryNodePackages(appRoot, pnpmLock) {
  const manifests = (await walkFiles(appRoot)).filter(
    (filePath) => path.basename(filePath) === "package.json",
  );
  const components = [];
  for (const manifestPath of manifests) {
    const relativePath = path.relative(appRoot, manifestPath);
    if (packageIsIgnored(relativePath)) {
      continue;
    }
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!manifest.name || !manifest.version) {
      continue;
    }
    if (
      !packageIsCompiled(relativePath) &&
      !lockContainsPackage(pnpmLock, manifest.name, manifest.version)
    ) {
      throw new Error(
        `${manifest.name}@${manifest.version} is packaged but absent from pnpm-lock.yaml`,
      );
    }
    components.push(
      makeComponent({
        group: packageIsCompiled(relativePath)
          ? "Next.js compiled dependencies"
          : "Node.js runtime packages",
        license: resolveNodeLicense(manifest),
        location: path.relative(path.dirname(appRoot), manifestPath),
        name: manifest.name,
        type: "library",
        version: manifest.version,
      }),
    );
  }
  return components;
}

async function inventoryPythonPackages(ttsRoot, runtimeLock) {
  const metadataRoot = path.join(
    ttsRoot,
    "_internal",
    "license-metadata",
    "python",
  );
  await requireDirectory(metadataRoot, "Python license metadata");
  const metadataFiles = (await walkFiles(metadataRoot)).filter(
    (filePath) => path.basename(filePath) === "METADATA",
  );
  const metadataByName = new Map();
  for (const metadataPath of metadataFiles) {
    const metadata = parseMetadata(await readFile(metadataPath, "utf8"));
    const name = metadata.first("Name");
    const version = metadata.first("Version");
    if (!name || !version) {
      throw new Error(`Incomplete Python metadata: ${metadataPath}`);
    }
    const normalizedName = normalizePythonName(name);
    if (metadataByName.has(normalizedName)) {
      throw new Error(`Duplicate packaged Python metadata: ${name}`);
    }
    metadataByName.set(normalizedName, { metadata, metadataPath, name, version });
  }
  if (metadataByName.size !== runtimeLock.length) {
    throw new Error(
      `Python metadata closure drifted: expected ${runtimeLock.length}, received ${metadataByName.size}`,
    );
  }
  return runtimeLock.map((locked) => {
    const packaged = metadataByName.get(locked.normalizedName);
    if (!packaged) {
      throw new Error(`Packaged Python metadata is missing ${locked.name}`);
    }
    if (packaged.version !== locked.version) {
      throw new Error(
        `${packaged.name} version drifted: expected ${locked.version}, received ${packaged.version}`,
      );
    }
    return makeComponent({
      group: "Python runtime packages",
      hash: locked.hash,
      license: resolvePythonLicense(packaged.metadata),
      location: path.relative(path.dirname(ttsRoot), packaged.metadataPath),
      name: packaged.name,
      type: "library",
      version: packaged.version,
    });
  });
}

async function inventoryProjectAssets(appRoot) {
  const publicRoot = path.join(appRoot, "public");
  try {
    await access(publicRoot);
  } catch {
    return [];
  }
  const assets = (await walkFiles(publicRoot)).filter((filePath) =>
    mediaExtensions.has(path.extname(filePath).toLowerCase()),
  );
  const relativeAssets = assets.map((filePath) =>
    toPosix(path.relative(publicRoot, filePath)),
  );
  const reviewedPaths = Object.keys(reviewedProjectAssets).sort();
  if (
    JSON.stringify([...relativeAssets].sort()) !== JSON.stringify(reviewedPaths)
  ) {
    throw new Error(
      `Project-owned media/font inventory drifted: expected ${reviewedPaths.join(", ")}, received ${relativeAssets.sort().join(", ")}`,
    );
  }
  return Promise.all(
    assets.map(async (assetPath) => {
      const relativePath = toPosix(path.relative(publicRoot, assetPath));
      const hash = await verifyHash(
        assetPath,
        reviewedProjectAssets[relativePath],
        `Project-owned asset ${relativePath}`,
      );
      return makeComponent({
        group: "Project-owned media and fonts",
        hash,
        license: "Project-owned asset",
        location: path.relative(path.dirname(appRoot), assetPath),
        name: path.basename(assetPath),
        type: "file",
      });
    }),
  );
}

function specialBuildComponents(buildLock) {
  const pyinstaller = buildLock.find(
    (item) => item.normalizedName === "pyinstaller",
  );
  return [
    makeComponent({
      group: "Build toolchain",
      license: "MIT",
      name: "@electron/fuses",
      scope: "excluded",
      type: "application",
      version: reviewedVersions.electronFuses,
    }),
    makeComponent({
      group: "Build toolchain",
      license: "MIT",
      name: "@electron/packager",
      scope: "excluded",
      type: "application",
      version: reviewedVersions.electronPackager,
    }),
    makeComponent({
      group: "Build toolchain",
      hash: pyinstaller.hash,
      license: "GPL-2.0-only WITH PyInstaller-Bootloader-exception",
      name: "PyInstaller",
      scope: "excluded",
      type: "application",
      version: reviewedVersions.pyinstaller,
    }),
    makeComponent({
      group: "Build toolchain",
      license: "Microsoft Windows SDK terms",
      name: "Windows SDK",
      scope: "excluded",
      type: "application",
      version: reviewedVersions.windowsSdk,
    }),
  ];
}

async function specialRuntimeComponents(applicationDirectory) {
  const resourcesRoot = path.join(applicationDirectory, "resources");
  const appRoot = path.join(resourcesRoot, "runtime", "app");
  const nodeRoot = path.join(resourcesRoot, "runtime", "node");
  const ttsRoot = path.join(resourcesRoot, "runtime", "tts");
  const internalRoot = path.join(ttsRoot, "_internal");
  const electronLicense = path.join(applicationDirectory, "LICENSE");
  const chromiumLicenses = path.join(
    applicationDirectory,
    "LICENSES.chromium.html",
  );
  const nodeLicense = path.join(nodeRoot, "LICENSE");
  await Promise.all([
    requireDirectory(appRoot, "Packaged application runtime"),
    requireDirectory(nodeRoot, "Packaged Node.js runtime"),
    requireDirectory(ttsRoot, "Packaged TTS runtime"),
    requireRegularFile(electronLicense, "Electron license"),
    requireRegularFile(chromiumLicenses, "Chromium license notices"),
    requireRegularFile(nodeLicense, "Node.js license"),
  ]);

  const electronVersion = (
    await readFile(path.join(applicationDirectory, "version"), "utf8")
  ).trim();
  if (electronVersion !== reviewedVersions.electron) {
    throw new Error(
      `Electron version drifted: expected ${reviewedVersions.electron}, received ${electronVersion}`,
    );
  }
  const nodeExecutable = path.join(nodeRoot, "node.exe");
  await requireRegularFile(nodeExecutable, "Node.js executable");
  const { stdout: nodeVersionOutput } = await execFileAsync(
    nodeExecutable,
    ["--version"],
    { windowsHide: true },
  );
  const nodeVersion = nodeVersionOutput.trim().replace(/^v/, "");
  if (nodeVersion !== reviewedVersions.node) {
    throw new Error(
      `Node.js version drifted: expected ${reviewedVersions.node}, received ${nodeVersion}`,
    );
  }

  const pythonDll = path.join(internalRoot, "python312.dll");
  const espeakDll = path.join(
    internalRoot,
    "espeakng_loader",
    "espeak-ng.dll",
  );
  const libsndfileDll = path.join(
    internalRoot,
    "_soundfile_data",
    "libsndfile_x64.dll",
  );
  await Promise.all([
    verifyHash(
      pythonDll,
      reviewedBinaryHashes.python,
      `CPython ${reviewedVersions.python}`,
    ),
    verifyHash(
      espeakDll,
      reviewedBinaryHashes.espeak,
      "eSpeak NG 1.52.0",
    ),
    verifyHash(
      libsndfileDll,
      reviewedBinaryHashes.libsndfile,
      `libsndfile ${reviewedVersions.libsndfile}`,
    ),
  ]);

  const components = [
    makeComponent({
      group: "Desktop and language runtimes",
      hash: await sha256File(electronLicense),
      license: "MIT",
      location: "LICENSE",
      name: "Electron",
      type: "framework",
      version: electronVersion,
    }),
    makeComponent({
      group: "Desktop and language runtimes",
      hash: await sha256File(chromiumLicenses),
      license: "Chromium bundled third-party notices",
      location: "LICENSES.chromium.html",
      name: "Chromium bundled components",
      type: "framework",
    }),
    makeComponent({
      group: "Desktop and language runtimes",
      hash: await sha256File(nodeLicense),
      license: "Node.js bundled license notices",
      location: path.relative(applicationDirectory, nodeLicense),
      name: "Node.js",
      type: "framework",
      version: nodeVersion,
    }),
    makeComponent({
      group: "Desktop and language runtimes",
      hash: reviewedBinaryHashes.python,
      license: "PSF-2.0",
      location: path.relative(applicationDirectory, pythonDll),
      name: "CPython",
      type: "framework",
      version: reviewedVersions.python,
    }),
    makeComponent({
      group: "Bundled native libraries",
      hash: reviewedBinaryHashes.espeak,
      license: "GPL-3.0-or-later",
      location: path.relative(applicationDirectory, espeakDll),
      name: "eSpeak NG",
      type: "library",
      version: "1.52.0",
    }),
    makeComponent({
      group: "Bundled native libraries",
      hash: reviewedBinaryHashes.libsndfile,
      license: "LGPL-2.1-or-later",
      location: path.relative(applicationDirectory, libsndfileDll),
      name: "libsndfile",
      type: "library",
      version: reviewedVersions.libsndfile,
    }),
    makeComponent({
      group: "Node.js runtime packages",
      license: "MIT",
      name: "@zip.js/zip.js",
      type: "library",
      version: reviewedVersions.zipJs,
    }),
    makeComponent({
      group: "Kokoro model resources",
      license: "Apache-2.0",
      name: "hexgrad/Kokoro-82M",
      type: "data",
      version: kokoroRevision,
    }),
  ];

  const packagedMicrosoftRuntimeFiles = (await walkFiles(internalRoot))
    .filter((filePath) =>
      /^(?:concrt|msvcp|ucrtbase|vcruntime).*\.dll$/i.test(
        path.basename(filePath),
      ),
    )
    .map((filePath) => toPosix(path.relative(internalRoot, filePath)))
    .sort();
  const reviewedMicrosoftPaths = Object.keys(
    reviewedMicrosoftRuntimeFiles,
  ).sort();
  if (
    JSON.stringify(packagedMicrosoftRuntimeFiles) !==
    JSON.stringify(reviewedMicrosoftPaths)
  ) {
    throw new Error(
      `Microsoft runtime DLL inventory drifted: expected ${reviewedMicrosoftPaths.join(", ")}, received ${packagedMicrosoftRuntimeFiles.join(", ")}`,
    );
  }
  for (const relativePath of reviewedMicrosoftPaths) {
    const reviewed = reviewedMicrosoftRuntimeFiles[relativePath];
    const dllPath = path.join(internalRoot, ...relativePath.split("/"));
    await verifyHash(
      dllPath,
      reviewed.hash,
      `Microsoft runtime DLL ${relativePath}`,
    );
    components.push(
      makeComponent({
        group: "Bundled native libraries",
        hash: reviewed.hash,
        license: reviewed.license,
        location: path.relative(applicationDirectory, dllPath),
        name: `Microsoft runtime: ${path.basename(relativePath)}`,
        type: "library",
        version: reviewed.version,
      }),
    );
  }

  const modelRoot = path.join(
    internalRoot,
    "models",
    "kokoro",
    kokoroRevision,
  );
  for (const [relativePath, expectedHash] of Object.entries(
    reviewedModelFiles,
  )) {
    const modelPath = path.join(modelRoot, ...relativePath.split("/"));
    await verifyHash(modelPath, expectedHash, `Kokoro model ${relativePath}`);
    components.push(
      makeComponent({
        group: "Kokoro model resources",
        hash: expectedHash,
        license: "Apache-2.0",
        location: path.relative(applicationDirectory, modelPath),
        name: `hexgrad/Kokoro-82M:${relativePath}`,
        type: "file",
        version: kokoroRevision,
      }),
    );
  }
  return { appRoot, components, ttsRoot };
}

export function renderReviewedNotices(components) {
  const groups = new Map();
  for (const component of components) {
    const group = componentGroup(component);
    const entries = groups.get(group) ?? [];
    entries.push(component);
    groups.set(group, entries);
  }
  const lines = [
    "# Third-Party Notices",
    "",
    "This reviewed inventory applies to Adaptive Audio Player 0.1.0 for Windows x64.",
    "The release generator fails if the packaged component set, pinned source locks,",
    "artifact hashes, or license classifications differ from this file.",
    "",
    "Full license and attribution texts remain packaged beside their components:",
    "",
    "- Electron and Chromium: `LICENSE` and `LICENSES.chromium.html`.",
    "- Node.js: `resources/runtime/node/LICENSE`.",
    "- Python packages: `resources/runtime/tts/_internal/license-metadata/python/`.",
    "- libsndfile: `resources/runtime/tts/_internal/_soundfile_data/COPYING`.",
    "",
    "eSpeak NG 1.52.0 is distributed under GPL-3.0-or-later. Corresponding source",
    "for the exact upstream release is available at",
    "https://github.com/espeak-ng/espeak-ng/tree/1.52.0.",
    "",
    "Kokoro model resources are from `hexgrad/Kokoro-82M` at immutable revision",
    `\`${kokoroRevision}\` and are classified Apache-2.0.`,
    "",
  ];
  for (const group of [...groups.keys()].sort()) {
    lines.push(`## ${group}`, "", "| Component | Version | License |", "| --- | --- | --- |");
    const entries = groups.get(group).sort((left, right) =>
      `${left.name}@${left.version ?? ""}`.localeCompare(
        `${right.name}@${right.version ?? ""}`,
      ),
    );
    for (const component of entries) {
      lines.push(
        `| ${component.name.replaceAll("|", "\\|")} | ${component.version ?? "n/a"} | ${componentLicense(component).replaceAll("|", "\\|")} |`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function createCycloneDxBom(components) {
  const canonicalComponents = mergeComponents(components);
  const identity = sha256(JSON.stringify(canonicalComponents));
  const uuid = [
    identity.slice(0, 8),
    identity.slice(8, 12),
    `4${identity.slice(13, 16)}`,
    `8${identity.slice(17, 20)}`,
    identity.slice(20, 32),
  ].join("-");
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    serialNumber: `urn:uuid:${uuid}`,
    version: 1,
    metadata: {
      component: {
        "bom-ref": "adaptive-audio-player",
        type: "application",
        name: "Adaptive Audio Player",
        version: reviewedVersions.application,
      },
      properties: [
        {
          name: "adaptive-audio-player:inventory-policy",
          value: "reviewed-locks-and-packaged-evidence",
        },
      ],
    },
    components: canonicalComponents,
  };
}

export function parseArguments(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!["--application", "--output", "--reviewed-notices"].includes(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = arguments_[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value`);
    }
    options[
      {
        "--application": "applicationDirectory",
        "--output": "outputDirectory",
        "--reviewed-notices": "reviewedNoticesPath",
      }[argument]
    ] = path.resolve(value);
    index += 1;
  }
  if (!options.applicationDirectory || !options.outputDirectory) {
    throw new Error("--application and --output are required");
  }
  options.reviewedNoticesPath ??= path.join(
    repositoryRoot,
    "THIRD_PARTY_NOTICES.md",
  );
  return options;
}

export async function inspectReleaseApplication({
  applicationDirectory,
  repository = repositoryRoot,
}) {
  await requireDirectory(applicationDirectory, "Packaged Electron application");
  const { buildLock, runtimeLock } = await validateSourceLocks(repository);
  const pnpmLock = await readFile(path.join(repository, "pnpm-lock.yaml"), "utf8");
  const runtime = await specialRuntimeComponents(applicationDirectory);
  const components = mergeComponents([
    ...runtime.components,
    ...(await inventoryNodePackages(runtime.appRoot, pnpmLock)),
    ...(await inventoryPythonPackages(runtime.ttsRoot, runtimeLock)),
    ...(await inventoryProjectAssets(runtime.appRoot)),
    ...specialBuildComponents(buildLock),
  ]);
  return {
    bom: createCycloneDxBom(components),
    components,
    notices: renderReviewedNotices(components),
  };
}

export async function generateReleaseInventory({
  applicationDirectory,
  outputDirectory,
  repository = repositoryRoot,
  reviewedNoticesPath = path.join(repositoryRoot, "THIRD_PARTY_NOTICES.md"),
}) {
  try {
    await access(outputDirectory);
    throw new Error(`Inventory output already exists: ${outputDirectory}`);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
  const inspected = await inspectReleaseApplication({
    applicationDirectory,
    repository,
  });
  await requireRegularFile(reviewedNoticesPath, "Reviewed third-party notices");
  const reviewedNotices = await readFile(reviewedNoticesPath, "utf8");
  if (reviewedNotices.replaceAll("\r\n", "\n") !== inspected.notices) {
    throw new Error(
      "THIRD_PARTY_NOTICES.md drifted from the packaged release inventory",
    );
  }
  await mkdir(outputDirectory, { recursive: false });
  const outputNotices = path.join(outputDirectory, "THIRD_PARTY_NOTICES.md");
  const outputSbom = path.join(outputDirectory, "release-sbom.cdx.json");
  await Promise.all([
    writeFile(outputNotices, inspected.notices, "utf8"),
    writeFile(outputSbom, `${JSON.stringify(inspected.bom, null, 2)}\n`, "utf8"),
  ]);
  const installedNotices = path.join(
    applicationDirectory,
    "resources",
    "THIRD_PARTY_NOTICES.md",
  );
  await cp(outputNotices, installedNotices, {
    errorOnExist: true,
    force: false,
  });
  return {
    componentCount: inspected.components.length,
    installedNotices,
    outputNotices,
    outputSbom,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = await generateReleaseInventory(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
