import { randomUUID } from "node:crypto";
import { mkdir, open, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { getDataRoot } from "@/lib/backend/env";
import { createAudioStreamResponse } from "@/lib/backend/http-audio";
import { synthesizeAudio } from "@/lib/backend/tts";
import {
  FAST_NARRATION_ENGINE_ID,
  getNarrationEngineDefinition,
  type NarrationEngineId,
} from "@/lib/narration/engines";
import {
  getVoiceCatalogEntry,
  voiceSupportsNarrationEngine,
  VOICE_PREVIEW_TEXT,
  type VoiceCatalogEntry,
} from "@/lib/voices/catalog";

const previewCacheDirectoryName = "voice-previews";
const previewCacheVersion = "v2";
const maximumVoicePreviewBytes = 8 * 1024 * 1024;
const browserPreviewCachePolicy = "public, max-age=86400, immutable";
const pendingPreviews = new Map<string, Promise<string>>();

function isPathContained(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function resolvePreviewCachePath(
  voice: VoiceCatalogEntry,
  engineId: NarrationEngineId,
) {
  const dataRoot = path.resolve(getDataRoot());
  const cacheRoot = path.join(dataRoot, previewCacheDirectoryName);
  await mkdir(cacheRoot, { recursive: true });

  const realDataRoot = await realpath(dataRoot);
  const realCacheRoot = await realpath(cacheRoot);
  if (!isPathContained(realDataRoot, realCacheRoot)) {
    throw new Error("Voice preview cache is outside the configured data root.");
  }

  return path.join(
    realCacheRoot,
    `${engineId}-${voice.id}-${previewCacheVersion}.wav`,
  );
}

function isMissingFileError(error: unknown) {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

async function hasValidCachedPreview(filePath: string) {
  try {
    const fileStats = await stat(filePath);
    if (
      !fileStats.isFile() ||
      fileStats.size < 44 ||
      fileStats.size > maximumVoicePreviewBytes
    ) {
      return false;
    }

    const header = Buffer.alloc(12);
    const file = await open(filePath, "r");
    try {
      const { bytesRead } = await file.read(header, 0, header.length, 0);
      return (
        bytesRead === header.length &&
        header.toString("ascii", 0, 4) === "RIFF" &&
        header.toString("ascii", 8, 12) === "WAVE" &&
        header.readUInt32LE(4) === fileStats.size - 8
      );
    } finally {
      await file.close();
    }
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }
    throw error;
  }
}

async function generateAndCachePreview(
  voice: VoiceCatalogEntry,
  engineId: NarrationEngineId,
  cachePath: string,
) {
  if (await hasValidCachedPreview(cachePath)) {
    return cachePath;
  }
  await rm(cachePath, { force: true });

  const audio = await synthesizeAudio({
    text: VOICE_PREVIEW_TEXT,
    narratorId: voice.engineVoiceId,
    mode: "classic",
    engineId,
  });
  if (audio.data.length > maximumVoicePreviewBytes) {
    throw new Error("Voice preview exceeded its cache size limit.");
  }

  const temporaryPath = `${cachePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, audio.data, { flag: "wx" });
    await rename(temporaryPath, cachePath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }

  return cachePath;
}

async function getCachedPreview(
  voice: VoiceCatalogEntry,
  engineId: NarrationEngineId,
) {
  const pendingKey = `${engineId}:${voice.id}`;
  const existingPreview = pendingPreviews.get(pendingKey);
  if (existingPreview) {
    return existingPreview;
  }

  const previewPromise = resolvePreviewCachePath(voice, engineId).then((cachePath) =>
    generateAndCachePreview(voice, engineId, cachePath),
  );
  pendingPreviews.set(pendingKey, previewPromise);

  try {
    return await previewPromise;
  } finally {
    if (pendingPreviews.get(pendingKey) === previewPromise) {
      pendingPreviews.delete(pendingKey);
    }
  }
}

async function serveVoicePreview(
  request: Request,
  context: { params: Promise<{ voiceId: string }> },
) {
  const { voiceId } = await context.params;
  const voice = getVoiceCatalogEntry(voiceId);
  const engineId =
    getNarrationEngineDefinition(new URL(request.url).searchParams.get("engine"))
      ?.id ?? FAST_NARRATION_ENGINE_ID;
  if (!voice || !voiceSupportsNarrationEngine(voice.id, engineId)) {
    return NextResponse.json(
      { error: "Voice preview not found." },
      { headers: { "Cache-Control": "no-store" }, status: 404 },
    );
  }

  try {
    const filePath = await getCachedPreview(voice, engineId);
    const response = await createAudioStreamResponse(request, {
      contentType: "audio/wav",
      filePath,
    });
    if (
      response.status === 200 ||
      response.status === 206
    ) {
      response.headers.set("Cache-Control", browserPreviewCachePolicy);
    }
    return response;
  } catch {
    return NextResponse.json(
      {
        error:
          "Voice preview is temporarily unavailable. Start local narration and try again.",
      },
      { headers: { "Cache-Control": "no-store" }, status: 503 },
    );
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ voiceId: string }> },
) {
  return serveVoicePreview(request, context);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ voiceId: string }> },
) {
  return serveVoicePreview(request, context);
}
