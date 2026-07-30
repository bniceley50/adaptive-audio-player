import { getLocalChatterboxConfig, getLocalTtsConfig } from "./env.ts";
import {
  FAST_NARRATION_ENGINE_ID,
  getNarrationEngineDefinition,
  HIGH_QUALITY_NARRATION_ENGINE_ID,
  type NarrationEngineId,
} from "../narration/engines.ts";

export const MAX_TTS_AUDIO_RESPONSE_BYTES = 128 * 1024 * 1024;
export const TTS_SECRET_HEADER =
  "x-adaptive-audio-player-tts-secret";

const MAX_TTS_ERROR_RESPONSE_BYTES = 64 * 1024;
const WAV_MIME_TYPE = "audio/wav" as const;

export interface SynthesizedAudioResult {
  data: Buffer;
  mimeType: typeof WAV_MIME_TYPE;
  extension: "wav";
  provider: "chatterbox-local" | "kokoro-local";
}

export interface SynthesizeAudioInput {
  text: string;
  narratorId: string | null;
  mode: string | null;
  engineId?: NarrationEngineId | null;
}

interface NarrationEngineAdapter {
  id: NarrationEngineId;
  synthesize: (input: SynthesizeAudioInput) => Promise<SynthesizedAudioResult>;
}

class SidecarResponseTooLargeError extends Error {}
class SidecarResponseLengthError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function timeoutError() {
  return new Error(
    "Local TTS sidecar timed out before it returned audio. Make sure Kokoro is running and try a shorter sample.",
  );
}

function readDeclaredContentLength(response: Response) {
  const rawLength = response.headers.get("content-length");
  if (rawLength === null) {
    return null;
  }

  if (!/^\d+$/.test(rawLength)) {
    throw new SidecarResponseLengthError();
  }

  const length = Number(rawLength);
  if (!Number.isSafeInteger(length)) {
    throw new SidecarResponseLengthError();
  }

  return length;
}

async function readBoundedResponseBody(response: Response, maxBytes: number) {
  const declaredLength = readDeclaredContentLength(response);
  if (declaredLength !== null && declaredLength > maxBytes) {
    throw new SidecarResponseTooLargeError();
  }

  if (!response.body) {
    if (declaredLength !== null && declaredLength !== 0) {
      throw new SidecarResponseLengthError();
    }
    return Buffer.alloc(0);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new SidecarResponseTooLargeError();
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (declaredLength !== null && declaredLength !== totalBytes) {
    throw new SidecarResponseLengthError();
  }

  return Buffer.concat(chunks, totalBytes);
}

async function readPlainEnglishError(response: Response) {
  try {
    const body = await readBoundedResponseBody(
      response,
      MAX_TTS_ERROR_RESPONSE_BYTES,
    );
    const payload = JSON.parse(body.toString("utf8")) as unknown;
    if (isRecord(payload) && typeof payload.detail === "string") {
      return payload.detail;
    }

    if (isRecord(payload) && typeof payload.error === "string") {
      return payload.error;
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
  }

  return `The local TTS sidecar returned HTTP ${response.status}.`;
}

function isValidWav(data: Buffer) {
  if (
    data.length < 44 ||
    data.toString("ascii", 0, 4) !== "RIFF" ||
    data.toString("ascii", 8, 12) !== "WAVE" ||
    data.readUInt32LE(4) !== data.length - 8
  ) {
    return false;
  }

  let offset = 12;
  let hasValidFormat = false;
  let hasAudioData = false;

  while (offset + 8 <= data.length) {
    const chunkId = data.toString("ascii", offset, offset + 4);
    const chunkSize = data.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;

    if (chunkEnd > data.length) {
      return false;
    }

    if (chunkId === "fmt ") {
      if (chunkSize < 16) {
        return false;
      }

      const audioFormat = data.readUInt16LE(chunkStart);
      const channelCount = data.readUInt16LE(chunkStart + 2);
      const sampleRate = data.readUInt32LE(chunkStart + 4);
      const byteRate = data.readUInt32LE(chunkStart + 8);
      const blockAlign = data.readUInt16LE(chunkStart + 12);
      const bitsPerSample = data.readUInt16LE(chunkStart + 14);
      hasValidFormat =
        (audioFormat === 1 || audioFormat === 3) &&
        channelCount >= 1 &&
        channelCount <= 8 &&
        sampleRate >= 8_000 &&
        sampleRate <= 384_000 &&
        byteRate > 0 &&
        blockAlign > 0 &&
        bitsPerSample >= 8 &&
        bitsPerSample <= 64;
    }

    if (chunkId === "data" && chunkSize > 0) {
      hasAudioData = true;
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  return hasValidFormat && hasAudioData && offset === data.length;
}

async function synthesizeWithKokoro(
  input: SynthesizeAudioInput,
): Promise<SynthesizedAudioResult> {
  const trimmedText = input.text.trim();
  if (!trimmedText) {
    throw new Error("Text is required before local narration can run.");
  }

  const config = getLocalTtsConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const renderUrl = new URL("/render", config.url).toString();

  try {
    let response: Response;
    try {
      response = await fetch(renderUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.secret
            ? { [TTS_SECRET_HEADER]: config.secret }
            : {}),
        },
        body: JSON.stringify({
          text: trimmedText,
          voice: input.narratorId ?? "marlowe",
          speed: 1,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) {
        throw timeoutError();
      }

      throw new Error(
        "Local TTS sidecar is not reachable. Start the Kokoro sidecar before generating audio.",
      );
    }

    if (!response.ok) {
      let detail: string;
      try {
        detail = await readPlainEnglishError(response);
      } catch (error) {
        if (isAbortError(error) || controller.signal.aborted) {
          throw timeoutError();
        }
        throw error;
      }

      throw new Error(`Local TTS sidecar failed: ${detail}`);
    }

    const responseMimeType =
      response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ??
      "";
    if (responseMimeType !== WAV_MIME_TYPE) {
      throw new Error(
        "Local TTS sidecar returned an unsupported audio content type.",
      );
    }

    let data: Buffer;
    try {
      data = await readBoundedResponseBody(
        response,
        MAX_TTS_AUDIO_RESPONSE_BYTES,
      );
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) {
        throw timeoutError();
      }
      if (error instanceof SidecarResponseTooLargeError) {
        throw new Error(
          "Local TTS sidecar returned more audio than the safe response limit.",
        );
      }
      if (error instanceof SidecarResponseLengthError) {
        throw new Error(
          "Local TTS sidecar returned an invalid audio response length.",
        );
      }

      throw new Error(
        "Local TTS sidecar returned an unreadable audio response.",
      );
    }

    if (controller.signal.aborted) {
      throw timeoutError();
    }

    if (!isValidWav(data)) {
      throw new Error("Local TTS sidecar returned corrupt WAV audio.");
    }

    return {
      data,
      mimeType: WAV_MIME_TYPE,
      extension: "wav",
      provider: "kokoro-local",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function synthesizeWithChatterbox(
  input: SynthesizeAudioInput,
): Promise<SynthesizedAudioResult> {
  const trimmedText = input.text.trim();
  if (!trimmedText) {
    throw new Error("Text is required before local narration can run.");
  }

  const config = getLocalChatterboxConfig();
  if (!config) {
    throw new Error(
      "High Quality narration is not running. Restart the app or use Fast / Compatible.",
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const renderUrl = new URL("/render", config.url).toString();

  try {
    let response: Response;
    try {
      response = await fetch(renderUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [TTS_SECRET_HEADER]: config.secret,
        },
        body: JSON.stringify({
          text: trimmedText,
          voice: input.narratorId ?? "chatterbox-default",
          speed: 1,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) {
        throw new Error(
          "High Quality narration timed out. Try a shorter passage or use Fast / Compatible.",
        );
      }
      throw new Error(
        "High Quality narration is not reachable. Restart the app or use Fast / Compatible.",
      );
    }

    if (!response.ok) {
      let detail: string;
      try {
        detail = await readPlainEnglishError(response);
      } catch (error) {
        if (isAbortError(error) || controller.signal.aborted) {
          throw new Error(
            "High Quality narration timed out. Try a shorter passage or use Fast / Compatible.",
          );
        }
        throw error;
      }
      throw new Error(`High Quality narration failed: ${detail}`);
    }

    const responseMimeType =
      response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ??
      "";
    if (responseMimeType !== WAV_MIME_TYPE) {
      throw new Error(
        "High Quality narration returned an unsupported audio content type.",
      );
    }

    let data: Buffer;
    try {
      data = await readBoundedResponseBody(
        response,
        MAX_TTS_AUDIO_RESPONSE_BYTES,
      );
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) {
        throw new Error(
          "High Quality narration timed out. Try a shorter passage or use Fast / Compatible.",
        );
      }
      if (error instanceof SidecarResponseTooLargeError) {
        throw new Error(
          "High Quality narration returned more audio than the safe response limit.",
        );
      }
      if (error instanceof SidecarResponseLengthError) {
        throw new Error(
          "High Quality narration returned an invalid audio response length.",
        );
      }
      throw new Error("High Quality narration returned unreadable audio.");
    }

    if (controller.signal.aborted) {
      throw new Error(
        "High Quality narration timed out. Try a shorter passage or use Fast / Compatible.",
      );
    }
    if (!isValidWav(data)) {
      throw new Error("High Quality narration returned corrupt WAV audio.");
    }

    return {
      data,
      mimeType: WAV_MIME_TYPE,
      extension: "wav",
      provider: "chatterbox-local",
    };
  } finally {
    clearTimeout(timeout);
  }
}

const narrationEngineAdapters = new Map<NarrationEngineId, NarrationEngineAdapter>([
  [
    FAST_NARRATION_ENGINE_ID,
    {
      id: FAST_NARRATION_ENGINE_ID,
      synthesize: synthesizeWithKokoro,
    },
  ],
  [
    HIGH_QUALITY_NARRATION_ENGINE_ID,
    {
      id: HIGH_QUALITY_NARRATION_ENGINE_ID,
      synthesize: synthesizeWithChatterbox,
    },
  ],
]);

export function resolveAvailableNarrationEngineId(
  requestedEngineId: unknown,
): NarrationEngineId {
  const requestedEngine = getNarrationEngineDefinition(requestedEngineId);
  return requestedEngine && narrationEngineAdapters.has(requestedEngine.id)
    ? requestedEngine.id
    : FAST_NARRATION_ENGINE_ID;
}

export async function synthesizeAudio(
  input: SynthesizeAudioInput,
): Promise<SynthesizedAudioResult> {
  const selectedEngineId = resolveAvailableNarrationEngineId(input.engineId);
  const adapter = narrationEngineAdapters.get(selectedEngineId);
  if (!adapter) {
    throw new Error(
      "Fast / Compatible narration is unavailable. Restart local narration and try again.",
    );
  }

  return adapter.synthesize(input);
}
