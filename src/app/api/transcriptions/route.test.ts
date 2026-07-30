import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transcribeUploadedAudio: vi.fn(),
}));

vi.mock("@/lib/backend/audio-transcription", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/backend/audio-transcription")>()),
  transcribeUploadedAudio: mocks.transcribeUploadedAudio,
}));

import { POST } from "@/app/api/transcriptions/route";
import { AudioTranscriptionError } from "@/lib/backend/audio-transcription";
import { MAX_AUDIO_IMPORT_BYTES } from "@/lib/transcription/audio-import";

const origin = "http://127.0.0.1:3100";

function createRequest({
  body = Uint8Array.from([1, 2, 3]),
  contentLength = "3",
  fileName = "Alice%20Chapter%201.mp3",
  requestOrigin = origin,
}: {
  body?: Uint8Array;
  contentLength?: string | null;
  fileName?: string | null;
  requestOrigin?: string;
} = {}) {
  const headers = new Headers({
    "content-type": "audio/mpeg",
    host: "127.0.0.1:3100",
    origin: requestOrigin,
  });
  if (contentLength !== null) {
    headers.set("content-length", contentLength);
  }
  if (fileName !== null) {
    headers.set("x-audio-file-name", fileName);
  }
  return new Request(`${origin}/api/transcriptions`, {
    method: "POST",
    headers,
    body: body as BodyInit,
  });
}

beforeEach(() => {
  mocks.transcribeUploadedAudio.mockReset();
});

describe("transcriptions route", () => {
  it("returns a private review draft without caching it", async () => {
    mocks.transcribeUploadedAudio.mockResolvedValue({
      title: "Alice",
      author: "Lewis Carroll",
      album: null,
      durationSeconds: 12.5,
      sourceFileName: "Alice Chapter 1.mp3",
      chapters: [],
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      transcript: {
        sourceFileName: "Alice Chapter 1.mp3",
        title: "Alice",
      },
    });
    expect(mocks.transcribeUploadedAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        contentLength: 3,
        fileName: "Alice Chapter 1.mp3",
        mimeType: "audio/mpeg",
      }),
    );
  });

  it("rejects cross-site and malformed requests before reading audio", async () => {
    const crossSite = await POST(
      createRequest({ requestOrigin: "https://attacker.example" }),
    );
    const missingName = await POST(createRequest({ fileName: null }));

    expect(crossSite.status).toBe(403);
    expect(missingName.status).toBe(400);
    expect(mocks.transcribeUploadedAudio).not.toHaveBeenCalled();
  });

  it("rejects declared oversized audio before reading the request body", async () => {
    const response = await POST(
      createRequest({ contentLength: String(MAX_AUDIO_IMPORT_BYTES + 1) }),
    );

    expect(response.status).toBe(413);
    expect(mocks.transcribeUploadedAudio).not.toHaveBeenCalled();
  });

  it("returns a bounded actionable local-runtime error", async () => {
    mocks.transcribeUploadedAudio.mockRejectedValue(
      new AudioTranscriptionError(
        "Local transcription is not installed. Install the approved Whisper model before importing audio.",
        503,
      ),
    );

    const response = await POST(createRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error:
        "Local transcription is not installed. Install the approved Whisper model before importing audio.",
    });
  });
});
