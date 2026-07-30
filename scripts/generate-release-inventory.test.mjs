import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  createCycloneDxBom,
  parseArguments,
  parseRequirementsLock,
  renderReviewedNotices,
  resolvePythonLicense,
  reviewedSourceHashes,
  validateSourceLocks,
} from "./generate-release-inventory.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const temporaryRoots = [];

function metadata(fields) {
  return {
    all(name) {
      const value = fields[name];
      return Array.isArray(value) ? value : value ? [value] : [];
    },
    first(name) {
      return this.all(name)[0];
    },
  };
}

async function makeSourceFixture() {
  const root = await mkdtemp(
    path.join(tmpdir(), "adaptive-release-inventory-test-"),
  );
  temporaryRoots.push(root);
  await Promise.all([
    mkdir(path.join(root, "tts_sidecar"), { recursive: true }),
    cp(
      path.join(repositoryRoot, "package.json"),
      path.join(root, "package.json"),
    ),
    cp(
      path.join(repositoryRoot, "pnpm-lock.yaml"),
      path.join(root, "pnpm-lock.yaml"),
    ),
  ]);
  await Promise.all([
    cp(
      path.join(repositoryRoot, "tts_sidecar", "requirements.txt"),
      path.join(root, "tts_sidecar", "requirements.txt"),
    ),
    cp(
      path.join(repositoryRoot, "tts_sidecar", "requirements-build.txt"),
      path.join(root, "tts_sidecar", "requirements-build.txt"),
    ),
  ]);
  return root;
}

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("release license and SBOM inventory", () => {
  it("accepts only the reviewed exact source locks", async () => {
    const validated = await validateSourceLocks(repositoryRoot);
    expect(validated.runtimeLock).toHaveLength(100);
    expect(validated.buildLock).toContainEqual(
      expect.objectContaining({
        hash: "7fae06c494ce0ebfe6bd3055c0e409def884f63af2e3705d06bd431ad9237fc7",
        normalizedName: "pyinstaller",
        version: "6.21.0",
      }),
    );
    expect(reviewedSourceHashes["tts_sidecar/requirements.txt"]).toBe(
      "92e3aab53af345c46afaba5a1e6d1c199edec6b9b5aa2de45503d46ea7ec6323",
    );

    const fixture = await makeSourceFixture();
    const requirementsPath = path.join(
      fixture,
      "tts_sidecar",
      "requirements.txt",
    );
    const requirements = await readFile(requirementsPath, "utf8");
    await writeFile(
      requirementsPath,
      requirements.replace("addict==2.4.0", "addict==2.4.1"),
      "utf8",
    );
    await expect(validateSourceLocks(fixture)).rejects.toThrow(
      "requirements.txt SHA-256 drifted",
    );
  });

  it("rejects incomplete hashes and licenses outside the reviewed policy", () => {
    expect(() => parseRequirementsLock("example==1.0\n")).toThrow(
      "missing one SHA-256 hash",
    );
    expect(
      resolvePythonLicense(
        metadata({
          Name: "classified-package",
          Classifier: ["License :: OSI Approved :: MIT License"],
        }),
      ),
    ).toBe("MIT");
    expect(() =>
      resolvePythonLicense(
        metadata({
          Name: "mystery-package",
          License: "Proprietary-ish",
        }),
      ),
    ).toThrow("unknown or missing license");
  });

  it("emits deterministic CycloneDX 1.6 data and human-readable notices", () => {
    const components = [
      {
        "bom-ref": "component-b",
        type: "library",
        name: "beta",
        version: "2.0.0",
        licenses: [{ expression: "Apache-2.0" }],
        properties: [
          {
            name: "adaptive-audio-player:group",
            value: "Runtime packages",
          },
        ],
      },
      {
        "bom-ref": "component-a",
        type: "library",
        name: "alpha",
        version: "1.0.0",
        licenses: [{ expression: "MIT" }],
        properties: [
          {
            name: "adaptive-audio-player:group",
            value: "Runtime packages",
          },
        ],
      },
    ];
    const first = createCycloneDxBom(components);
    const second = createCycloneDxBom([...components].reverse());
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      bomFormat: "CycloneDX",
      specVersion: "1.6",
      version: 1,
    });
    expect(first.components.map((component) => component["bom-ref"])).toEqual([
      "component-a",
      "component-b",
    ]);
    const notices = renderReviewedNotices(components);
    expect(notices).toContain("## Runtime packages");
    expect(notices).toContain("| alpha | 1.0.0 | MIT |");
    expect(notices).toContain(
      "https://github.com/espeak-ng/espeak-ng/tree/1.52.0",
    );
  });

  it("requires explicit input and output paths", () => {
    expect(() => parseArguments(["--application", "app"])).toThrow(
      "--application and --output are required",
    );
    expect(() =>
      parseArguments([
        "--application",
        "app",
        "--output",
        "inventory",
        "--write-reviewed",
        "yes",
      ]),
    ).toThrow("Unknown argument: --write-reviewed");
  });
});
