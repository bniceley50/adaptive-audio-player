import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PublicGenerationOutputSummary } from "./types";
import {
  assembleGeneratedWavParts,
  deleteGeneratedAudioAsset,
  readGeneratedAudioAsset,
  resolveGeneratedAudioAssetPath,
  writeGeneratedAudioPart,
  writeGeneratedAudioAsset,
} from "./audio-storage";

const originalDataRoot = process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT;

function createPcmWav(data: Buffer, sampleRate = 24_000) {
  const wav = Buffer.alloc(44 + data.length);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(data.length, 40);
  data.copy(wav, 44);
  return wav;
}

function readStandardWavData(wav: Buffer) {
  expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
  expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
  expect(wav.toString("ascii", 36, 40)).toBe("data");
  const dataLength = wav.readUInt32LE(40);
  return wav.subarray(44, 44 + dataLength);
}

describe("generated audio storage containment", () => {
  let dataRoot = "";

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(process.cwd(), ".adaptive-audio-storage-"));
    process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT = dataRoot;
  });

  afterEach(() => {
    if (originalDataRoot === undefined) {
      delete process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT;
    } else {
      process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT = originalDataRoot;
    }

    rmSync(dataRoot, { force: true, recursive: true });
  });

  function writeFixture(data = Buffer.from("contained audio")) {
    return writeGeneratedAudioAsset({
      bookId: "book-1",
      data,
      extension: "wav",
      kind: "sample-generation",
      workspaceId: "workspace-1",
    });
  }

  it("writes and resolves normal paths relative to the generated-audio root", () => {
    const stored = writeFixture();

    expect(path.isAbsolute(stored.relativePath)).toBe(false);
    expect(stored.relativePath).toBe(path.relative(process.cwd(), stored.absolutePath));
    expect(resolveGeneratedAudioAssetPath(stored.relativePath)).toBe(stored.absolutePath);
    expect(readGeneratedAudioAsset(stored.relativePath)?.data).toEqual(
      Buffer.from("contained audio"),
    );
    expect(deleteGeneratedAudioAsset(stored.relativePath)).toBe(true);
    expect(existsSync(stored.absolutePath)).toBe(false);
  });

  it("rejects traversal outside the generated-audio root", () => {
    const outsidePath = path.join(dataRoot, "outside.wav");
    writeFileSync(outsidePath, "outside audio");
    const traversalPath = path.join(
      path.relative(process.cwd(), path.join(dataRoot, "generated-audio")),
      "..",
      "outside.wav",
    );

    expect(resolveGeneratedAudioAssetPath(traversalPath)).toBeNull();
    expect(readGeneratedAudioAsset(traversalPath)).toBeNull();
    expect(deleteGeneratedAudioAsset(traversalPath)).toBe(false);
    expect(existsSync(outsidePath)).toBe(true);
  });

  it("rejects absolute paths even when they point inside the generated-audio root", () => {
    const stored = writeFixture();

    expect(resolveGeneratedAudioAssetPath(stored.absolutePath)).toBeNull();
    expect(readGeneratedAudioAsset(stored.absolutePath)).toBeNull();
    expect(deleteGeneratedAudioAsset(stored.absolutePath)).toBe(false);
    expect(existsSync(stored.absolutePath)).toBe(true);
  });

  it("rejects sibling paths that merely share the generated root prefix", () => {
    const siblingRoot = path.join(dataRoot, "generated-audio-private");
    const outsidePath = path.join(siblingRoot, "outside.wav");
    mkdirSync(siblingRoot, { recursive: true });
    writeFileSync(outsidePath, "outside audio");
    const prefixConfusionPath = path.relative(process.cwd(), outsidePath);

    expect(resolveGeneratedAudioAssetPath(prefixConfusionPath)).toBeNull();
    expect(readGeneratedAudioAsset(prefixConfusionPath)).toBeNull();
    expect(deleteGeneratedAudioAsset(prefixConfusionPath)).toBe(false);
    expect(existsSync(outsidePath)).toBe(true);
  });

  it("rejects symlinks that escape the generated-audio root when supported", ({ skip }) => {
    const generatedRoot = path.join(dataRoot, "generated-audio");
    const outsideRoot = path.join(dataRoot, "outside");
    const outsidePath = path.join(outsideRoot, "outside.wav");
    const linkedRoot = path.join(generatedRoot, "linked");
    mkdirSync(generatedRoot, { recursive: true });
    mkdirSync(outsideRoot, { recursive: true });
    writeFileSync(outsidePath, "outside audio");

    try {
      symlinkSync(outsideRoot, linkedRoot, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error.code === "EPERM" || error.code === "ENOTSUP")
      ) {
        skip();
        return;
      }

      throw error;
    }

    const linkedPath = path.relative(process.cwd(), path.join(linkedRoot, "outside.wav"));
    expect(resolveGeneratedAudioAssetPath(linkedPath)).toBeNull();
    expect(readGeneratedAudioAsset(linkedPath)).toBeNull();
    expect(deleteGeneratedAudioAsset(linkedPath)).toBe(false);
    expect(existsSync(outsidePath)).toBe(true);
  });
});

describe("bounded WAV part assembly", () => {
  let dataRoot = "";

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(process.cwd(), ".adaptive-audio-assembly-"));
    process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT = dataRoot;
  });

  afterEach(() => {
    if (originalDataRoot === undefined) {
      delete process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT;
    } else {
      process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT = originalDataRoot;
    }

    rmSync(dataRoot, { force: true, recursive: true });
  });

  it("assembles many chapter parts sequentially with a bounded copy buffer", () => {
    const chapterCount = 64;
    const chapterPcmBytes = 48_000;
    const partPaths: string[] = [];
    const absolutePartPaths: string[] = [];

    for (let chapterIndex = 0; chapterIndex < chapterCount; chapterIndex += 1) {
      const part = writeGeneratedAudioPart({
        workspaceId: "workspace-1",
        bookId: "book-1",
        kind: "full-book-generation",
        extension: "wav",
        data: createPcmWav(Buffer.alloc(chapterPcmBytes, chapterIndex)),
        label: `chapter-${chapterIndex + 1}`,
      });
      partPaths.push(part.relativePath);
      absolutePartPaths.push(part.absolutePath);
      expect(resolveGeneratedAudioAssetPath(part.relativePath)).toBeNull();
    }

    const assembled = assembleGeneratedWavParts({
      workspaceId: "workspace-1",
      bookId: "book-1",
      kind: "full-book-generation",
      partPaths,
      label: "complete",
    });
    const wav = readFileSync(assembled.absolutePath);
    const pcm = readStandardWavData(wav);

    expect(pcm).toHaveLength(chapterCount * chapterPcmBytes);
    expect(pcm.subarray(0, chapterPcmBytes)).toEqual(
      Buffer.alloc(chapterPcmBytes, 0),
    );
    expect(pcm.subarray(-chapterPcmBytes)).toEqual(
      Buffer.alloc(chapterPcmBytes, chapterCount - 1),
    );
    expect(pcm.length / 48_000).toBe(chapterCount);
    expect(assembled.partDurationsSeconds).toEqual(
      Array.from({ length: chapterCount }, () => 1),
    );
    expect(assembled.peakBufferBytes).toBeLessThanOrEqual(64 * 1024);
    expect(assembled.peakBufferBytes).toBeLessThan(pcm.length);
    expect(absolutePartPaths.every((partPath) => !existsSync(partPath))).toBe(true);
    expect(resolveGeneratedAudioAssetPath(assembled.relativePath)).toBe(
      assembled.absolutePath,
    );
  });

  it("rejects incompatible chapter formats without a partial final file", () => {
    const compatiblePart = writeGeneratedAudioPart({
      workspaceId: "workspace-1",
      bookId: "book-1",
      kind: "full-book-generation",
      extension: "wav",
      data: createPcmWav(Buffer.alloc(48_000), 24_000),
      label: "chapter-1",
    });
    const incompatiblePart = writeGeneratedAudioPart({
      workspaceId: "workspace-1",
      bookId: "book-1",
      kind: "full-book-generation",
      extension: "wav",
      data: createPcmWav(Buffer.alloc(44_100), 22_050),
      label: "chapter-2",
    });

    expect(() =>
      assembleGeneratedWavParts({
        workspaceId: "workspace-1",
        bookId: "book-1",
        kind: "full-book-generation",
        partPaths: [
          compatiblePart.relativePath,
          incompatiblePart.relativePath,
        ],
        label: "incompatible",
      }),
    ).toThrow("Chapter audio files use incompatible WAV formats.");
    expect(existsSync(compatiblePart.absolutePath)).toBe(false);
    expect(existsSync(incompatiblePart.absolutePath)).toBe(false);

    const finalWorkspace = path.join(
      dataRoot,
      "generated-audio",
      "workspace-1",
    );
    expect(existsSync(finalWorkspace) ? readdirSync(finalWorkspace) : []).toEqual(
      [],
    );
  });

  it("rejects a temporary-part directory that escapes through a symlink", ({
    skip,
  }) => {
    const generatedRoot = path.join(dataRoot, "generated-audio");
    const outsideRoot = path.join(dataRoot, "outside-parts");
    const partRoot = path.join(generatedRoot, ".parts");
    mkdirSync(generatedRoot, { recursive: true });
    mkdirSync(outsideRoot, { recursive: true });

    try {
      symlinkSync(outsideRoot, partRoot, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error.code === "EPERM" || error.code === "ENOTSUP")
      ) {
        skip();
        return;
      }

      throw error;
    }

    expect(() =>
      writeGeneratedAudioPart({
        workspaceId: "workspace-1",
        bookId: "book-1",
        kind: "full-book-generation",
        extension: "wav",
        data: createPcmWav(Buffer.alloc(48_000)),
      }),
    ).toThrow("Temporary audio storage must stay inside the generated-audio root.");
    expect(readdirSync(outsideRoot)).toEqual([]);
  });
});

describe("PublicGenerationOutputSummary", () => {
  it("provides browser-safe artifact references without filesystem fields", () => {
    type FilesystemField = Extract<
      keyof PublicGenerationOutputSummary,
      "assetPath" | "chapterAssetPaths"
    >;
    const hasNoFilesystemFields: FilesystemField extends never ? true : false = true;
    const output = {
      artifactId: "artifact-1",
      artifactUrl: "/api/audio/generated/book-1/artifacts/artifact-1",
      bookId: "book-1",
      chapterArtifacts: [],
      chapterCount: 1,
      chapterIndex: null,
      chapterTitle: null,
      generatedAt: "2026-07-18T12:00:00.000Z",
      isChapterArtifact: false,
      isCurrent: true,
      jobId: "job-1",
      kind: "sample-generation",
      mimeType: "audio/wav",
      mode: "balanced",
      narratorId: "narrator-1",
      provider: "kokoro-local",
    } satisfies PublicGenerationOutputSummary;

    expect(hasNoFilesystemFields).toBe(true);
    expect(output.artifactId).toBe("artifact-1");
    expect(output.artifactUrl).toMatch(/^\/api\/audio\//);
    expect(Object.keys(output)).not.toContain("assetPath");
    expect(Object.keys(output)).not.toContain("chapterAssetPaths");
  });
});
