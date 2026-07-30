import { NextResponse } from "next/server";

import {
  AudioTranscriptionError,
  transcribeUploadedAudio,
} from "@/lib/backend/audio-transcription";
import { verifySameOriginMutation } from "@/lib/backend/csrf";
import { MAX_AUDIO_IMPORT_BYTES } from "@/lib/transcription/audio-import";

export const runtime = "nodejs";

const maximumEncodedFileNameCharacters = 2_048;
const maximumFileNameCharacters = 255;

function readAudioFileName(request: Request) {
  const encoded = request.headers.get("x-audio-file-name");
  if (!encoded || encoded.length > maximumEncodedFileNameCharacters) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(encoded).trim();
    const leafName = decoded.split(/[\\/]/u).at(-1)?.trim() ?? "";
    return leafName && leafName.length <= maximumFileNameCharacters
      ? leafName
      : null;
  } catch {
    return null;
  }
}

function readContentLength(request: Request) {
  const rawLength = request.headers.get("content-length");
  if (rawLength === null) {
    return null;
  }
  if (!/^\d+$/u.test(rawLength)) {
    return Number.NaN;
  }
  const length = Number(rawLength);
  return Number.isSafeInteger(length) && length > 0 ? length : Number.NaN;
}

export async function POST(request: Request) {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) {
    return csrfError;
  }

  const fileName = readAudioFileName(request);
  const contentLength = readContentLength(request);
  const mimeType = request.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "";
  if (!fileName || Number.isNaN(contentLength) || !request.body) {
    return NextResponse.json(
      { error: "Choose a valid MP3 or M4B audiobook recording." },
      { status: 400 },
    );
  }
  if (contentLength !== null && contentLength > MAX_AUDIO_IMPORT_BYTES) {
    return NextResponse.json(
      {
        error:
          "This audiobook is larger than 2 GB. Split it into smaller recordings before importing.",
      },
      { status: 413 },
    );
  }

  try {
    const transcript = await transcribeUploadedAudio({
      body: request.body,
      contentLength,
      fileName,
      mimeType,
      signal: request.signal,
    });
    return NextResponse.json(
      { transcript },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AudioTranscriptionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: "Local transcription failed. Try again." },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
