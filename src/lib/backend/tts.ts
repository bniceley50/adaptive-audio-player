import { readFile } from "node:fs/promises";

import { getLocalTtsConfig } from "./env.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readPlainEnglishError(response: Response) {
  const payload = (await response.json().catch(() => null)) as unknown;
  if (isRecord(payload) && typeof payload.detail === "string") {
    return payload.detail;
  }

  if (isRecord(payload) && typeof payload.error === "string") {
    return payload.error;
  }

  return `The local TTS sidecar returned HTTP ${response.status}.`;
}

export async function synthesizeAudio(input: {
  text: string;
  narratorId: string | null;
  mode: string | null;
}) {
  const trimmedText = input.text.trim();
  if (!trimmedText) {
    throw new Error("Text is required before local narration can run.");
  }

  const config = getLocalTtsConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const renderUrl = new URL("/render", config.url).toString();

  let response: Response;
  try {
    response = await fetch(renderUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: trimmedText,
        voice: input.narratorId ?? "marlowe",
        speed: 1,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "Local TTS sidecar timed out before it returned audio. Make sure Kokoro is running and try a shorter sample.",
      );
    }

    throw new Error(
      "Local TTS sidecar is not reachable. Start the Kokoro sidecar before generating audio.",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Local TTS sidecar failed: ${await readPlainEnglishError(response)}`);
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!isRecord(payload)) {
    throw new Error("Local TTS sidecar returned an invalid render response.");
  }

  if (payload.provider !== "kokoro-local") {
    throw new Error("Local TTS sidecar returned an unexpected audio provider.");
  }

  const audioPath = typeof payload.audioPath === "string" ? payload.audioPath : "";
  if (!audioPath.trim()) {
    throw new Error("Local TTS sidecar did not report a generated audio file.");
  }

  let data: Buffer;
  try {
    data = await readFile(audioPath);
  } catch {
    throw new Error(
      "Local TTS sidecar reported audio, but the app could not read the generated file.",
    );
  }

  return {
    data,
    mimeType: "audio/wav",
    extension: "wav",
    provider: "kokoro-local" as const,
  };
}
