import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDataRoot } from "./env.ts";
import { generateMockWav } from "./mock-audio.ts";

function resolveAudioRoot() {
  return path.join(getDataRoot(), "generated-audio");
}

function ensureAudioRoot() {
  const root = resolveAudioRoot();
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true });
  }

  return root;
}

function sanitizeFilePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

export function writeGeneratedAudioAsset(input: {
  workspaceId: string;
  bookId: string;
  kind: string;
  extension: string;
  data: Buffer;
  label?: string | null;
}) {
  const root = ensureAudioRoot();
  const workspaceDir = path.join(root, input.workspaceId);
  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true });
  }

  const label = input.label ? sanitizeFilePart(input.label) : "";
  const fileName = `${input.bookId}-${input.kind}${label ? `-${label}` : ""}-${Date.now()}-${randomUUID()}.${input.extension}`;
  const absolutePath = path.join(workspaceDir, fileName);
  writeFileSync(absolutePath, input.data);

  return {
    absolutePath,
    relativePath: path.relative(process.cwd(), absolutePath),
  };
}

export function deleteGeneratedAudioAsset(relativePath: string) {
  const audioRoot = path.resolve(resolveAudioRoot());
  const absolutePath = path.resolve(
    path.isAbsolute(relativePath) ? relativePath : path.join(process.cwd(), relativePath),
  );

  if (!absolutePath.startsWith(`${audioRoot}${path.sep}`)) {
    return false;
  }

  if (!existsSync(absolutePath)) {
    return false;
  }

  rmSync(absolutePath, { force: true });
  return true;
}

function readRequiredWavChunk(buffer: Buffer, chunkId: string) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Generated audio is not a WAV file.");
  }

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;

    if (dataEnd > buffer.length) {
      throw new Error("Generated WAV file is truncated.");
    }

    if (id === chunkId) {
      return buffer.subarray(dataStart, dataEnd);
    }

    offset = dataEnd + (size % 2);
  }

  throw new Error(`Generated WAV file is missing the ${chunkId} chunk.`);
}

export function stitchWavAudioAssets(buffers: Buffer[]) {
  if (buffers.length === 0) {
    throw new Error("At least one chapter audio file is required.");
  }

  const formatChunk = Buffer.from(readRequiredWavChunk(buffers[0], "fmt "));
  const dataChunks = buffers.map((buffer) => {
    const candidateFormat = readRequiredWavChunk(buffer, "fmt ");
    if (!candidateFormat.equals(formatChunk)) {
      throw new Error("Chapter audio files use incompatible WAV formats.");
    }

    return Buffer.from(readRequiredWavChunk(buffer, "data"));
  });
  const dataSize = dataChunks.reduce((total, chunk) => total + chunk.length, 0);
  const riffSize = 4 + 8 + formatChunk.length + 8 + dataSize;
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(riffSize, 4);
  header.write("WAVE", 8, "ascii");

  const fmtHeader = Buffer.alloc(8);
  fmtHeader.write("fmt ", 0, "ascii");
  fmtHeader.writeUInt32LE(formatChunk.length, 4);

  const dataHeader = Buffer.alloc(8);
  dataHeader.write("data", 0, "ascii");
  dataHeader.writeUInt32LE(dataSize, 4);

  return Buffer.concat([header, fmtHeader, formatChunk, dataHeader, ...dataChunks]);
}

export function readGeneratedAudioAsset(relativePath: string) {
  const absolutePath = path.isAbsolute(relativePath)
    ? relativePath
    : path.join(process.cwd(), relativePath);

  if (!existsSync(absolutePath)) {
    if (relativePath.startsWith("generated/demo/")) {
      const demoLabel = relativePath
        .replace(/^generated\/demo\//, "")
        .replace(/\.[^.]+$/, "")
        .replaceAll("/", " ");

      return {
        absolutePath,
        data: generateMockWav(`Portfolio demo audio for ${demoLabel}`),
      };
    }

    return null;
  }

  return {
    absolutePath,
    data: readFileSync(absolutePath),
  };
}
