import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  approvedMakeAppxProductVersion,
  createProofLogo,
  inspectProofManifest,
  manifestAssetDimensions,
  parseArguments,
  prepareMsixInputs,
  proofManifestIdentity,
} from "./build-msix.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function readPngDimensions(buffer) {
  expect(buffer.subarray(0, 8).toString("hex")).toBe(
    "89504e470d0a1a0a",
  );
  expect(buffer.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

describe("unsigned MSIX proof", () => {
  it("uses an explicit non-production full-trust Windows 11 x64 identity", async () => {
    const manifestPath = path.join(
      repositoryRoot,
      "desktop",
      "AppxManifest.xml",
    );
    const manifest = await readFile(manifestPath, "utf8");

    expect(inspectProofManifest(manifest)).toBe(proofManifestIdentity);
    expect(proofManifestIdentity).toEqual({
      name: "AdaptiveAudioPlayer.UnsignedProof",
      publisher: "CN=Adaptive Audio Player Unsigned Proof",
      version: "0.1.0.0",
      architecture: "x64",
      executable: "AdaptiveAudioPlayer.exe",
    });
    expect(manifest).toContain('MinVersion="10.0.22000.0"');
    expect(manifest).toContain("Not for distribution.");
    expect(approvedMakeAppxProductVersion).toBe("10.0.26100.7705");
  });

  it("maps every Electron file plus only the manifest and generated tile assets", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "adaptive-msix-test-"));
    const inputDirectory = path.join(root, "app");
    const workingDirectory = path.join(root, "work");
    await Promise.all([
      mkdir(path.join(inputDirectory, "resources"), { recursive: true }),
      mkdir(workingDirectory, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(inputDirectory, "AdaptiveAudioPlayer.exe"), "exe"),
      writeFile(path.join(inputDirectory, "resources", "app.asar"), "asar"),
    ]);

    try {
      const prepared = await prepareMsixInputs({
        inputDirectory,
        workingDirectory,
      });
      expect(
        prepared.applicationFiles.map((file) => file.destination),
      ).toEqual(["AdaptiveAudioPlayer.exe", "resources\\app.asar"]);
      expect(
        prepared.injectedFiles.map((file) => file.destination),
      ).toEqual([
        "AppxManifest.xml",
        "Assets\\Square44x44Logo.png",
        "Assets\\Square150x150Logo.png",
        "Assets\\StoreLogo.png",
      ]);
      const mapping = await readFile(prepared.mappingPath, "utf8");
      expect(mapping.startsWith("[Files]\r\n")).toBe(true);
      expect(mapping).toContain(
        '"AdaptiveAudioPlayer.exe"',
      );
      expect(mapping).not.toContain("AppxSignature.p7x");
      for (const [destination, size] of Object.entries(
        manifestAssetDimensions,
      )) {
        const logo = await readFile(
          path.join(workingDirectory, ...destination.split("\\")),
        );
        expect(readPngDimensions(logo)).toEqual({ width: size, height: size });
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("rejects metadata collisions and invalid command lines", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "adaptive-msix-test-"));
    const inputDirectory = path.join(root, "app");
    const workingDirectory = path.join(root, "work");
    await mkdir(inputDirectory, { recursive: true });
    await Promise.all([
      writeFile(path.join(inputDirectory, "AdaptiveAudioPlayer.exe"), "exe"),
      writeFile(path.join(inputDirectory, "AppxManifest.xml"), "collision"),
    ]);
    try {
      await expect(
        prepareMsixInputs({ inputDirectory, workingDirectory }),
      ).rejects.toThrow("collides with MSIX metadata");
      expect(() => parseArguments(["--input", inputDirectory])).toThrow(
        "--input and --output are required",
      );
      expect(() =>
        parseArguments([
          "--input",
          inputDirectory,
          "--output",
          path.join(root, "proof.msix"),
          "--sign",
          "never",
        ]),
      ).toThrow("Unknown argument: --sign");
      expect(() => createProofLogo(0)).toThrow("Logo size");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
