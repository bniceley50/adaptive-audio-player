"use client";

import {
  getAudioImportFileValidationError,
  MAX_AUDIO_IMPORT_DURATION_SECONDS,
} from "@/lib/transcription/audio-import";
import {
  MAX_EXTRACTED_TEXT_CHARACTERS,
  MAX_IMPORT_CHAPTERS,
  MAX_IMPORT_TITLE_CHARACTERS,
} from "@/lib/validation/import-validation";

export interface AudioTranscriptChapter {
  endMs: number;
  id: string;
  order: number;
  startMs: number;
  text: string;
  title: string;
}

export interface AudioTranscriptDraft {
  album: string | null;
  author: string | null;
  chapters: AudioTranscriptChapter[];
  durationSeconds: number;
  sourceFileName: string;
  title: string;
}

export class TranscriptionsApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "TranscriptionsApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readBoundedDisplayText(
  value: unknown,
  maximumCharacters: number,
): string | undefined;
function readBoundedDisplayText(
  value: unknown,
  maximumCharacters: number,
  nullable: true,
): string | null | undefined;
function readBoundedDisplayText(
  value: unknown,
  maximumCharacters: number,
  nullable = false,
): string | null | undefined {
  if (nullable && value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized && normalized.length <= maximumCharacters
    ? normalized
    : undefined;
}

function readTranscriptDraft(value: unknown): AudioTranscriptDraft | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = readBoundedDisplayText(
    value.title,
    MAX_IMPORT_TITLE_CHARACTERS,
  );
  const sourceFileName = readBoundedDisplayText(value.sourceFileName, 255);
  const author = readBoundedDisplayText(value.author, 500, true);
  const album = readBoundedDisplayText(value.album, 500, true);
  const durationSeconds = value.durationSeconds;
  if (
    title === undefined ||
    sourceFileName === undefined ||
    author === undefined ||
    album === undefined ||
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > MAX_AUDIO_IMPORT_DURATION_SECONDS ||
    !Array.isArray(value.chapters) ||
    value.chapters.length === 0 ||
    value.chapters.length > MAX_IMPORT_CHAPTERS
  ) {
    return null;
  }

  const durationMilliseconds = Math.ceil(durationSeconds * 1_000) + 2_000;
  const chapters: AudioTranscriptChapter[] = [];
  let totalCharacters = 0;
  let previousEnd = 0;
  for (const [order, chapterValue] of value.chapters.entries()) {
    if (!isRecord(chapterValue)) {
      return null;
    }
    const chapterTitle = readBoundedDisplayText(
      chapterValue.title,
      MAX_IMPORT_TITLE_CHARACTERS,
    );
    const chapterText =
      typeof chapterValue.text === "string" ? chapterValue.text.trim() : null;
    const expectedId = `chapter-${order + 1}`;
    if (
      chapterValue.id !== expectedId ||
      chapterValue.order !== order ||
      !Number.isSafeInteger(chapterValue.startMs) ||
      !Number.isSafeInteger(chapterValue.endMs) ||
      Number(chapterValue.startMs) < 0 ||
      Number(chapterValue.startMs) < previousEnd ||
      Number(chapterValue.endMs) <= Number(chapterValue.startMs) ||
      Number(chapterValue.endMs) > durationMilliseconds ||
      chapterTitle === undefined ||
      chapterText === null
    ) {
      return null;
    }

    totalCharacters += chapterTitle.length + chapterText.length;
    if (totalCharacters > MAX_EXTRACTED_TEXT_CHARACTERS) {
      return null;
    }
    chapters.push({
      endMs: Number(chapterValue.endMs),
      id: expectedId,
      order,
      startMs: Number(chapterValue.startMs),
      text: chapterText,
      title: chapterTitle,
    });
    previousEnd = Number(chapterValue.endMs);
  }

  return {
    album,
    author,
    chapters,
    durationSeconds,
    sourceFileName,
    title,
  };
}

function errorMessageForStatus(status: number) {
  if (status === 400 || status === 413 || status === 422) {
    return "This audio recording could not be transcribed safely. Review the file and try again.";
  }
  if (status === 403) {
    return "The local app could not authorize this transcription. Reload and try again.";
  }
  if (status === 503) {
    return "Local transcription is unavailable. Verify FFmpeg and the approved Whisper model, then try again.";
  }
  return "Local transcription failed. Your audio was not added to the library; try again.";
}

function readServerError(value: unknown) {
  if (!isRecord(value) || typeof value.error !== "string") {
    return null;
  }
  const message = value.error.trim();
  return message && message.length <= 500 ? message : null;
}

function isAbortError(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "AbortError"
  );
}

function requestMimeType(file: File) {
  if (file.type.trim()) {
    return file.type.trim().toLowerCase();
  }
  return file.name.toLowerCase().endsWith(".m4b") ? "audio/mp4" : "audio/mpeg";
}

export async function transcribeAudioBook(
  file: File,
  options: { signal?: AbortSignal } = {},
): Promise<AudioTranscriptDraft> {
  const validationError = getAudioImportFileValidationError(file);
  if (validationError) {
    throw new TranscriptionsApiError(validationError, null, false);
  }

  let response: Response;
  try {
    response = await fetch("/api/transcriptions", {
      method: "POST",
      body: file,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": requestMimeType(file),
        "x-audio-file-name": encodeURIComponent(file.name),
      },
      signal: options.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new TranscriptionsApiError(
      "The local transcription request could not be completed. Choose the file again.",
      null,
      true,
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new TranscriptionsApiError(
      readServerError(payload) ?? errorMessageForStatus(response.status),
      response.status,
      response.status >= 500 || response.status === 403,
    );
  }

  const transcript = isRecord(payload)
    ? readTranscriptDraft(payload.transcript)
    : null;
  if (!transcript) {
    throw new TranscriptionsApiError(
      "The local transcript returned invalid review data. Choose the file again.",
      response.status,
      true,
    );
  }
  return transcript;
}
