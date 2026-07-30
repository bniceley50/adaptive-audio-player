import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDataRoot } from "./env.ts";

function resolveAudioRoot() {
  return path.resolve(getDataRoot(), "generated-audio");
}

function resolveAudioPartRoot() {
  return path.join(resolveAudioRoot(), ".parts");
}

function ensureAudioRoot() {
  const root = resolveAudioRoot();
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true });
  }

  return root;
}

function ensureAudioPartRoot() {
  const audioRoot = ensureAudioRoot();
  const root = resolveAudioPartRoot();
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true });
  }

  const realAudioRoot = realpathSync(audioRoot);
  const realPartRoot = realpathSync(root);
  if (!isPathContained(realAudioRoot, realPartRoot)) {
    throw new Error(
      "Temporary audio storage must stay inside the generated-audio root.",
    );
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

function sanitizeRequiredFilePart(value: string, name: string) {
  const sanitized = sanitizeFilePart(value);
  if (!sanitized) {
    throw new Error(`${name} must contain at least one letter or number.`);
  }

  return sanitized;
}

function isPathContained(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function resolveGeneratedAudioAssetCandidatePath(relativePath: string) {
  if (!relativePath.trim() || path.isAbsolute(relativePath)) {
    return null;
  }

  const audioRoot = resolveAudioRoot();
  const candidatePath = path.resolve(process.cwd(), relativePath);
  if (!isPathContained(audioRoot, candidatePath)) {
    return null;
  }

  const partRoot = resolveAudioPartRoot();
  if (
    candidatePath === partRoot ||
    isPathContained(partRoot, candidatePath)
  ) {
    return null;
  }

  return candidatePath;
}

export function resolveGeneratedAudioAssetPath(relativePath: string) {
  const candidatePath = resolveGeneratedAudioAssetCandidatePath(relativePath);
  if (!candidatePath) {
    return null;
  }

  try {
    const realAudioRoot = realpathSync(resolveAudioRoot());
    const realCandidatePath = realpathSync(candidatePath);
    if (
      !isPathContained(realAudioRoot, realCandidatePath) ||
      !statSync(realCandidatePath).isFile()
    ) {
      return null;
    }

    return realCandidatePath;
  } catch {
    return null;
  }
}

function resolveGeneratedAudioPartPath(relativePath: string) {
  if (!relativePath.trim() || path.isAbsolute(relativePath)) {
    return null;
  }

  const partRoot = resolveAudioPartRoot();
  const candidatePath = path.resolve(process.cwd(), relativePath);
  if (!isPathContained(partRoot, candidatePath)) {
    return null;
  }

  try {
    const realAudioRoot = realpathSync(resolveAudioRoot());
    const realPartRoot = realpathSync(partRoot);
    if (!isPathContained(realAudioRoot, realPartRoot)) {
      return null;
    }
    const realCandidatePath = realpathSync(candidatePath);
    if (
      !isPathContained(realPartRoot, realCandidatePath) ||
      !statSync(realCandidatePath).isFile()
    ) {
      return null;
    }

    return realCandidatePath;
  } catch {
    return null;
  }
}

type GeneratedAudioWriteInput = {
  workspaceId: string;
  bookId: string;
  kind: string;
  extension: string;
  data: Buffer;
  label?: string | null;
};

function createGeneratedAudioFilePath(
  storageRoot: string,
  input: Omit<GeneratedAudioWriteInput, "data">,
) {
  const workspaceId = sanitizeRequiredFilePart(input.workspaceId, "workspaceId");
  const bookId = sanitizeRequiredFilePart(input.bookId, "bookId");
  const kind = sanitizeRequiredFilePart(input.kind, "kind");
  const extension = sanitizeRequiredFilePart(input.extension, "extension");
  const workspaceDir = path.join(storageRoot, workspaceId);
  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true });
  }

  const realRoot = realpathSync(storageRoot);
  const realWorkspaceDir = realpathSync(workspaceDir);
  if (!isPathContained(realRoot, realWorkspaceDir)) {
    throw new Error("Generated audio workspace must stay inside the configured root.");
  }

  const label = input.label ? sanitizeFilePart(input.label) : "";
  const fileName = `${bookId}-${kind}${label ? `-${label}` : ""}-${Date.now()}-${randomUUID()}.${extension}`;
  const absolutePath = path.join(workspaceDir, fileName);
  return {
    absolutePath,
    relativePath: path.relative(process.cwd(), absolutePath),
  };
}

export function writeGeneratedAudioAsset(input: GeneratedAudioWriteInput) {
  const root = ensureAudioRoot();
  const stored = createGeneratedAudioFilePath(root, input);
  writeFileSync(stored.absolutePath, input.data);
  return stored;
}

export function writeGeneratedAudioPart(input: GeneratedAudioWriteInput) {
  const root = ensureAudioPartRoot();
  const stored = createGeneratedAudioFilePath(root, input);
  writeFileSync(stored.absolutePath, input.data);
  return stored;
}

export function deleteGeneratedAudioAsset(relativePath: string) {
  const absolutePath = resolveGeneratedAudioAssetPath(relativePath);
  if (!absolutePath) {
    return false;
  }

  rmSync(absolutePath, { force: true });
  return true;
}

export type GeneratedAudioAssetDeletionResult =
  | { status: "deleted"; absolutePath: string }
  | { status: "missing"; absolutePath: string }
  | { status: "rejected"; message: string }
  | { status: "failed"; absolutePath: string; message: string };

export function deleteGeneratedAudioAssetWithResult(
  relativePath: string,
): GeneratedAudioAssetDeletionResult {
  if (!relativePath.trim() || path.isAbsolute(relativePath)) {
    return {
      status: "rejected",
      message: "Generated audio path is outside contained artifact storage.",
    };
  }

  const candidatePath = resolveGeneratedAudioAssetCandidatePath(relativePath);
  if (!candidatePath) {
    const unresolvedPath = path.resolve(process.cwd(), relativePath);
    if (!existsSync(unresolvedPath)) {
      return { status: "missing", absolutePath: unresolvedPath };
    }

    return {
      status: "rejected",
      message: "Generated audio path is outside contained artifact storage.",
    };
  }

  if (!existsSync(candidatePath)) {
    return { status: "missing", absolutePath: candidatePath };
  }

  const absolutePath = resolveGeneratedAudioAssetPath(relativePath);
  if (!absolutePath) {
    return {
      status: "rejected",
      message: "Generated audio path is not a contained regular file.",
    };
  }

  try {
    rmSync(absolutePath);
    return { status: "deleted", absolutePath };
  } catch (error) {
    return {
      status: "failed",
      absolutePath,
      message:
        error instanceof Error ? error.message : "Generated audio deletion failed.",
    };
  }
}

export function deleteGeneratedAudioPart(relativePath: string) {
  const absolutePath = resolveGeneratedAudioPartPath(relativePath);
  if (!absolutePath) {
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

const maximumGeneratedAudioParts = 300;
const maximumWavFormatChunkBytes = 4 * 1024;
const wavAssemblyCopyBufferBytes = 64 * 1024;

function readExactFileBytes(fileDescriptor: number, length: number, position: number) {
  const buffer = Buffer.alloc(length);
  let bytesRead = 0;

  while (bytesRead < length) {
    const nextRead = readSync(
      fileDescriptor,
      buffer,
      bytesRead,
      length - bytesRead,
      position + bytesRead,
    );
    if (nextRead === 0) {
      throw new Error("Generated WAV file is truncated.");
    }
    bytesRead += nextRead;
  }

  return buffer;
}

function validatePcmWavFormat(formatChunk: Buffer) {
  if (formatChunk.length < 16) {
    throw new Error("Generated WAV file has an invalid format chunk.");
  }

  const audioFormat = formatChunk.readUInt16LE(0);
  const channels = formatChunk.readUInt16LE(2);
  const sampleRate = formatChunk.readUInt32LE(4);
  const byteRate = formatChunk.readUInt32LE(8);
  const blockAlign = formatChunk.readUInt16LE(12);
  const bitsPerSample = formatChunk.readUInt16LE(14);
  if (
    audioFormat !== 1 ||
    channels === 0 ||
    sampleRate === 0 ||
    blockAlign === 0 ||
    bitsPerSample === 0 ||
    bitsPerSample % 8 !== 0 ||
    blockAlign !== channels * (bitsPerSample / 8) ||
    byteRate !== sampleRate * blockAlign
  ) {
    throw new Error("Generated WAV file has unsupported PCM parameters.");
  }

  return { blockAlign, byteRate };
}

function readWavPartLayout(relativePath: string) {
  const absolutePath = resolveGeneratedAudioPartPath(relativePath);
  if (!absolutePath) {
    throw new Error("Generated audio part is missing or outside temporary storage.");
  }

  const fileSize = statSync(absolutePath).size;
  const fileDescriptor = openSync(absolutePath, "r");

  try {
    const riffHeader = readExactFileBytes(fileDescriptor, 12, 0);
    if (
      riffHeader.toString("ascii", 0, 4) !== "RIFF" ||
      riffHeader.toString("ascii", 8, 12) !== "WAVE"
    ) {
      throw new Error("Generated audio is not a WAV file.");
    }
    if (riffHeader.readUInt32LE(4) + 8 > fileSize) {
      throw new Error("Generated WAV file is truncated.");
    }

    let offset = 12;
    let formatChunk: Buffer | null = null;
    let dataOffset: number | null = null;
    let dataSize: number | null = null;
    while (offset + 8 <= fileSize) {
      const chunkHeader = readExactFileBytes(fileDescriptor, 8, offset);
      const chunkId = chunkHeader.toString("ascii", 0, 4);
      const chunkSize = chunkHeader.readUInt32LE(4);
      const chunkDataOffset = offset + 8;
      const chunkEnd = chunkDataOffset + chunkSize;
      if (chunkEnd > fileSize) {
        throw new Error("Generated WAV file is truncated.");
      }

      if (chunkId === "fmt " && formatChunk === null) {
        if (chunkSize < 16 || chunkSize > maximumWavFormatChunkBytes) {
          throw new Error("Generated WAV file has an invalid format chunk.");
        }
        formatChunk = readExactFileBytes(
          fileDescriptor,
          chunkSize,
          chunkDataOffset,
        );
      } else if (chunkId === "data" && dataOffset === null) {
        dataOffset = chunkDataOffset;
        dataSize = chunkSize;
      }

      offset = chunkEnd + (chunkSize % 2);
    }

    if (!formatChunk) {
      throw new Error("Generated WAV file is missing the fmt  chunk.");
    }
    if (dataOffset === null || dataSize === null) {
      throw new Error("Generated WAV file is missing the data chunk.");
    }

    const { blockAlign, byteRate } = validatePcmWavFormat(formatChunk);
    if (dataSize === 0 || dataSize % blockAlign !== 0) {
      throw new Error("Generated WAV data is not aligned to its PCM format.");
    }

    return {
      absolutePath,
      dataOffset,
      dataSize,
      durationSeconds: dataSize / byteRate,
      formatChunk,
    };
  } finally {
    closeSync(fileDescriptor);
  }
}

function createWavOutputHeader(formatChunk: Buffer, dataSize: number) {
  const formatPadding = formatChunk.length % 2;
  const headerSize = 12 + 8 + formatChunk.length + formatPadding + 8;
  const fileSize = headerSize + dataSize;
  if (fileSize - 8 > 0xffff_ffff || dataSize > 0xffff_ffff) {
    throw new Error("Generated full-book WAV exceeds the supported file size.");
  }

  const header = Buffer.alloc(headerSize);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(fileSize - 8, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(formatChunk.length, 16);
  formatChunk.copy(header, 20);
  const dataHeaderOffset = 20 + formatChunk.length + formatPadding;
  header.write("data", dataHeaderOffset, "ascii");
  header.writeUInt32LE(dataSize, dataHeaderOffset + 4);
  return header;
}

export function assembleGeneratedWavParts(input: {
  workspaceId: string;
  bookId: string;
  kind: string;
  partPaths: string[];
  label?: string | null;
}) {
  let assembled:
    | {
        absolutePath: string;
        relativePath: string;
        peakBufferBytes: number;
        partDurationsSeconds: number[];
      }
    | null = null;
  let assemblyError: unknown = null;

  try {
    if (input.partPaths.length === 0) {
      throw new Error("At least one chapter audio part is required.");
    }
    if (input.partPaths.length > maximumGeneratedAudioParts) {
      throw new Error(`At most ${maximumGeneratedAudioParts} chapter audio parts are supported.`);
    }
    if (new Set(input.partPaths).size !== input.partPaths.length) {
      throw new Error("Chapter audio part paths must be unique.");
    }

    const layouts: Array<{
      absolutePath: string;
      dataOffset: number;
      dataSize: number;
      durationSeconds: number;
    }> = [];
    let formatChunk: Buffer | null = null;
    let totalDataSize = 0;
    for (const partPath of input.partPaths) {
      const layout = readWavPartLayout(partPath);
      if (formatChunk === null) {
        formatChunk = Buffer.from(layout.formatChunk);
      } else if (!layout.formatChunk.equals(formatChunk)) {
        throw new Error("Chapter audio files use incompatible WAV formats.");
      }
      totalDataSize += layout.dataSize;
      if (totalDataSize > 0xffff_ffff) {
        throw new Error("Generated full-book WAV exceeds the supported file size.");
      }
      layouts.push({
        absolutePath: layout.absolutePath,
        dataOffset: layout.dataOffset,
        dataSize: layout.dataSize,
        durationSeconds: layout.durationSeconds,
      });
    }

    if (!formatChunk) {
      throw new Error("At least one chapter audio part is required.");
    }
    const outputHeader = createWavOutputHeader(formatChunk, totalDataSize);
    const copyBuffer = Buffer.alloc(wavAssemblyCopyBufferBytes);
    const output = createGeneratedAudioFilePath(ensureAudioRoot(), {
      workspaceId: input.workspaceId,
      bookId: input.bookId,
      kind: input.kind,
      extension: "wav",
      label: input.label,
    });
    const outputDescriptor = openSync(output.absolutePath, "wx");

    try {
      writeSync(outputDescriptor, outputHeader, 0, outputHeader.length, null);
      for (const layout of layouts) {
        const partDescriptor = openSync(layout.absolutePath, "r");
        try {
          let inputPosition = layout.dataOffset;
          let remainingBytes = layout.dataSize;
          while (remainingBytes > 0) {
            const requestedBytes = Math.min(remainingBytes, copyBuffer.length);
            const bytesRead = readSync(
              partDescriptor,
              copyBuffer,
              0,
              requestedBytes,
              inputPosition,
            );
            if (bytesRead === 0) {
              throw new Error("Generated WAV file changed during assembly.");
            }

            let writtenBytes = 0;
            while (writtenBytes < bytesRead) {
              const nextWrite = writeSync(
                outputDescriptor,
                copyBuffer,
                writtenBytes,
                bytesRead - writtenBytes,
                null,
              );
              if (nextWrite === 0) {
                throw new Error("Generated WAV output could not be written.");
              }
              writtenBytes += nextWrite;
            }
            inputPosition += bytesRead;
            remainingBytes -= bytesRead;
          }
        } finally {
          closeSync(partDescriptor);
        }
      }
    } catch (error) {
      closeSync(outputDescriptor);
      rmSync(output.absolutePath, { force: true });
      throw error;
    }
    closeSync(outputDescriptor);

    assembled = {
      ...output,
      peakBufferBytes: Math.max(
        outputHeader.length,
        formatChunk.length,
        copyBuffer.length,
      ),
      partDurationsSeconds: layouts.map((layout) => layout.durationSeconds),
    };
  } catch (error) {
    assemblyError = error;
  }

  let cleanupFailed = false;
  for (const partPath of input.partPaths) {
    cleanupFailed = !deleteGeneratedAudioPart(partPath) || cleanupFailed;
  }

  if (assemblyError) {
    throw assemblyError;
  }
  if (!assembled) {
    throw new Error("Generated full-book WAV assembly did not produce an output.");
  }
  if (cleanupFailed) {
    rmSync(assembled.absolutePath, { force: true });
    throw new Error("Temporary chapter audio could not be removed after assembly.");
  }

  return assembled;
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
  const header = createWavOutputHeader(formatChunk, dataSize);
  return Buffer.concat([header, ...dataChunks]);
}

export function readGeneratedAudioAsset(relativePath: string) {
  const absolutePath = resolveGeneratedAudioAssetPath(relativePath);
  if (!absolutePath) {
    return null;
  }

  return {
    absolutePath,
    data: readFileSync(absolutePath),
  };
}
