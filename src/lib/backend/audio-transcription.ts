import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rmdir,
  stat,
  unlink,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { getDataRoot } from "@/lib/backend/env";
import {
  getAudioImportFileValidationError,
  MAX_AUDIO_IMPORT_BYTES,
  parseAudioProbe,
  parseWhisperJsonLines,
  proposeAudioChapters,
  type ProposedAudioChapter,
} from "@/lib/transcription/audio-import";

export const WHISPER_MODEL_REVISION =
  "5359861c739e955e79d9a303bcbc70fb988958b1";
export const WHISPER_MODEL_FILE = "ggml-base.en.bin";
export const WHISPER_MODEL_BYTES = 147_964_211;
export const WHISPER_MODEL_SHA256 =
  "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002";

const maximumProbeOutputBytes = 2_000_000;
const maximumProcessDiagnosticBytes = 64_000;
const probeTimeoutMilliseconds = 30_000;
const transcriptionTimeoutMilliseconds = 60 * 60 * 1_000;

export interface AudioTranscriptionDraft {
  album: string | null;
  author: string | null;
  chapters: ProposedAudioChapter[];
  durationSeconds: number;
  sourceFileName: string;
  title: string;
}

export class AudioTranscriptionError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413 | 422 | 499 | 503,
  ) {
    super(message);
    this.name = "AudioTranscriptionError";
  }
}

interface ProcessInput {
  args: string[];
  command: string;
  cwd?: string;
  maximumStdoutBytes: number;
  signal?: AbortSignal;
  timeoutMilliseconds: number;
}

interface ProcessResult {
  stderr: string;
  stdout: string;
}

interface TranscriptionDependencies {
  dataRoot?: string;
  ffmpegCommand?: string;
  ffprobeCommand?: string;
  maximumUploadBytes?: number;
  runProcess?: (input: ProcessInput) => Promise<ProcessResult>;
  verifyModel?: () => Promise<string>;
}

interface UploadedAudioInput {
  body: ReadableStream<Uint8Array>;
  contentLength: number | null;
  fileName: string;
  mimeType: string;
  signal?: AbortSignal;
}

function getDefaultWhisperModelPath() {
  const localAppData = process.env.LOCALAPPDATA?.trim();
  const runtimeRoot = localAppData || path.join(homedir(), ".local", "share");
  return path.join(
    runtimeRoot,
    "adaptive-audio-player-transcription",
    `whisper.cpp-${WHISPER_MODEL_REVISION}`,
    WHISPER_MODEL_FILE,
  );
}

function isContainedPath(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function hashFileSha256(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

export async function verifyWhisperModelFile({
  expectedBytes = WHISPER_MODEL_BYTES,
  expectedSha256 = WHISPER_MODEL_SHA256,
  modelPath = getDefaultWhisperModelPath(),
}: {
  expectedBytes?: number;
  expectedSha256?: string;
  modelPath?: string;
} = {}) {
  let modelStats;
  try {
    modelStats = await lstat(modelPath);
  } catch {
    throw new AudioTranscriptionError(
      "Local transcription is not installed. Install the approved Whisper model before importing audio.",
      503,
    );
  }

  if (
    !modelStats.isFile() ||
    modelStats.isSymbolicLink() ||
    modelStats.size !== expectedBytes
  ) {
    throw new AudioTranscriptionError(
      "The local transcription model failed verification. Reinstall the approved model before importing audio.",
      503,
    );
  }

  const actualSha256 = await hashFileSha256(modelPath);
  if (actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new AudioTranscriptionError(
      "The local transcription model failed verification. Reinstall the approved model before importing audio.",
      503,
    );
  }

  return path.dirname(modelPath);
}

function appendBoundedText(
  chunks: Buffer[],
  chunk: Buffer,
  currentBytes: number,
  maximumBytes: number,
) {
  if (currentBytes + chunk.byteLength > maximumBytes) {
    throw new Error("Local process output exceeded its safety limit.");
  }
  chunks.push(chunk);
  return currentBytes + chunk.byteLength;
}

async function runBoundedProcess({
  args,
  command,
  cwd,
  maximumStdoutBytes,
  signal,
  timeoutMilliseconds,
}: ProcessInput): Promise<ProcessResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const finish = (error?: Error, result?: ProcessResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      if (error) {
        reject(error);
      } else if (result) {
        resolve(result);
      }
    };
    const abort = () => {
      child.kill();
      finish(new AudioTranscriptionError("Audio transcription was cancelled.", 499));
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish(new Error("Local transcription timed out."));
    }, timeoutMilliseconds);

    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }

    child.stdout.on("data", (chunk: Buffer) => {
      try {
        stdoutBytes = appendBoundedText(
          stdoutChunks,
          chunk,
          stdoutBytes,
          maximumStdoutBytes,
        );
      } catch (error) {
        child.kill();
        finish(error as Error);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      try {
        stderrBytes = appendBoundedText(
          stderrChunks,
          chunk,
          stderrBytes,
          maximumProcessDiagnosticBytes,
        );
      } catch (error) {
        child.kill();
        finish(error as Error);
      }
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (code !== 0) {
        finish(new Error(`Local process exited with code ${code ?? "unknown"}.`));
        return;
      }
      finish(undefined, { stderr, stdout });
    });
  });
}

async function createContainedUploadDirectory(dataRoot: string) {
  const uploadRoot = path.resolve(dataRoot, "transcription-temp");
  await mkdir(uploadRoot, { recursive: true });
  const rootStats = await lstat(uploadRoot);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new AudioTranscriptionError(
      "The private transcription workspace is unavailable.",
      503,
    );
  }

  const canonicalRoot = await realpath(uploadRoot);
  const uploadDirectory = await mkdtemp(path.join(canonicalRoot, "upload-"));
  const canonicalUploadDirectory = await realpath(uploadDirectory);
  if (!isContainedPath(canonicalRoot, canonicalUploadDirectory)) {
    throw new AudioTranscriptionError(
      "The private transcription workspace is unavailable.",
      503,
    );
  }
  return canonicalUploadDirectory;
}

async function writeUpload({
  body,
  contentLength,
  maximumBytes,
  sourcePath,
  signal,
}: {
  body: ReadableStream<Uint8Array>;
  contentLength: number | null;
  maximumBytes: number;
  sourcePath: string;
  signal?: AbortSignal;
}) {
  const handle = await open(sourcePath, "wx", 0o600);
  const reader = body.getReader();
  let totalBytes = 0;

  try {
    while (true) {
      if (signal?.aborted) {
        throw new AudioTranscriptionError("Audio transcription was cancelled.", 499);
      }
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      totalBytes += chunk.value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new AudioTranscriptionError(
          "This audiobook is larger than 2 GB. Split it into smaller recordings before importing.",
          413,
        );
      }
      await handle.write(chunk.value);
    }
  } catch (error) {
    if (error instanceof AudioTranscriptionError) {
      throw error;
    }
    throw new AudioTranscriptionError(
      "The audio upload could not be read. Choose the file again.",
      400,
    );
  } finally {
    reader.releaseLock();
    await handle.close();
  }

  if (totalBytes === 0 || (contentLength !== null && totalBytes !== contentLength)) {
    throw new AudioTranscriptionError(
      "The audio upload was incomplete. Choose the file again.",
      400,
    );
  }
  return totalBytes;
}

function titleFromFileName(fileName: string) {
  return (
    fileName
      .replace(/\.[^.]+$/u, "")
      .replace(/[_-]+/gu, " ")
      .replace(/\s+/gu, " ")
      .trim() || "Re-narrated audiobook"
  );
}

function toTranscriptionError(error: unknown) {
  if (error instanceof AudioTranscriptionError) {
    return error;
  }
  return new AudioTranscriptionError(
    "Local transcription failed. Verify FFmpeg and the approved Whisper model, then try again.",
    503,
  );
}

export async function transcribeUploadedAudio(
  input: UploadedAudioInput,
  dependencies: TranscriptionDependencies = {},
): Promise<AudioTranscriptionDraft> {
  const maximumUploadBytes =
    dependencies.maximumUploadBytes ?? MAX_AUDIO_IMPORT_BYTES;
  const metadataError = getAudioImportFileValidationError({
    name: input.fileName,
    size: input.contentLength ?? 1,
    type: input.mimeType,
  });
  if (metadataError) {
    throw new AudioTranscriptionError(
      metadataError,
      input.contentLength !== null && input.contentLength > maximumUploadBytes
        ? 413
        : 400,
    );
  }
  if (input.contentLength !== null && input.contentLength > maximumUploadBytes) {
    throw new AudioTranscriptionError(
      "This audiobook is larger than 2 GB. Split it into smaller recordings before importing.",
      413,
    );
  }

  const extension = input.fileName.toLowerCase().endsWith(".m4b") ? "m4b" : "mp3";
  const uploadDirectory = await createContainedUploadDirectory(
    dependencies.dataRoot ?? getDataRoot(),
  );
  const sourcePath = path.join(uploadDirectory, `source.${extension}`);

  try {
    const actualBytes = await writeUpload({
      body: input.body,
      contentLength: input.contentLength,
      maximumBytes: maximumUploadBytes,
      sourcePath,
      signal: input.signal,
    });
    const finalMetadataError = getAudioImportFileValidationError({
      name: input.fileName,
      size: actualBytes,
      type: input.mimeType,
    });
    if (finalMetadataError) {
      throw new AudioTranscriptionError(finalMetadataError, 400);
    }

    const runProcess = dependencies.runProcess ?? runBoundedProcess;
    const ffprobeResult = await runProcess({
      command: dependencies.ffprobeCommand ?? "ffprobe",
      args: [
        "-v",
        "error",
        "-show_format",
        "-show_streams",
        "-show_chapters",
        "-of",
        "json",
        sourcePath,
      ],
      maximumStdoutBytes: maximumProbeOutputBytes,
      signal: input.signal,
      timeoutMilliseconds: probeTimeoutMilliseconds,
    });

    let probeJson: unknown;
    try {
      probeJson = JSON.parse(ffprobeResult.stdout);
    } catch {
      throw new AudioTranscriptionError(
        "This audiobook could not be inspected safely.",
        400,
      );
    }

    let probe;
    try {
      probe = parseAudioProbe(probeJson, input.fileName);
    } catch (error) {
      throw new AudioTranscriptionError(
        error instanceof Error ? error.message : "This audiobook could not be inspected safely.",
        400,
      );
    }

    const modelRoot = await (dependencies.verifyModel ?? verifyWhisperModelFile)();
    const transcriptFileName = `transcript-${randomUUID()}.json`;
    const transcriptPath = path.join(modelRoot, transcriptFileName);
    try {
      await runProcess({
        command: dependencies.ffmpegCommand ?? "ffmpeg",
        args: [
          "-hide_banner",
          "-nostdin",
          "-loglevel",
          "warning",
          "-i",
          sourcePath,
          "-vn",
          "-af",
          [
            `whisper=model=${WHISPER_MODEL_FILE}`,
            "language=en",
            "queue=30",
            "use_gpu=true",
            `destination=${transcriptFileName}`,
            "format=json",
          ].join(":"),
          "-f",
          "null",
          process.platform === "win32" ? "NUL" : "/dev/null",
        ],
        cwd: modelRoot,
        maximumStdoutBytes: 16_000,
        signal: input.signal,
        timeoutMilliseconds: transcriptionTimeoutMilliseconds,
      });

      const transcriptStats = await stat(transcriptPath);
      if (!transcriptStats.isFile() || transcriptStats.size > 24_000_000) {
        throw new AudioTranscriptionError(
          "The local transcript exceeds the supported safety limit.",
          422,
        );
      }
      const transcriptJson = await readFile(transcriptPath, "utf8");
      let segments;
      try {
        segments = parseWhisperJsonLines(transcriptJson, probe.durationSeconds);
      } catch (error) {
        throw new AudioTranscriptionError(
          error instanceof Error ? error.message : "No speech could be transcribed from this audiobook.",
          422,
        );
      }

      return {
        album: probe.album,
        author: probe.artist,
        chapters: proposeAudioChapters(segments, probe, input.fileName),
        durationSeconds: probe.durationSeconds,
        sourceFileName: input.fileName,
        title: probe.title ?? probe.album ?? titleFromFileName(input.fileName),
      };
    } finally {
      await unlink(transcriptPath).catch(() => undefined);
    }
  } catch (error) {
    throw toTranscriptionError(error);
  } finally {
    await unlink(sourcePath).catch(() => undefined);
    await rmdir(uploadDirectory).catch(() => undefined);
  }
}
