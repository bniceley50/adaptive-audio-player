// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TranscriptionsApiError,
  transcribeAudioBook,
} from "@/lib/client/transcriptions-api";

function audioFile(name = "alice.mp3", type = "audio/mpeg") {
  return new File([Uint8Array.from([73, 68, 51, 1])], name, { type });
}

function validPayload() {
  return {
    transcript: {
      album: "Alice's Adventures in Wonderland",
      author: "Lewis Carroll",
      chapters: [
        {
          endMs: 12_500,
          id: "chapter-1",
          order: 0,
          startMs: 0,
          text: "Alice followed the White Rabbit.",
          title: "Chapter 1",
        },
      ],
      durationSeconds: 12.5,
      sourceFileName: "alice.mp3",
      title: "Alice",
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("transcriptions client API", () => {
  it("uploads raw audio with bounded metadata and decodes a review draft", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(validPayload()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const file = audioFile("Alice Chapter 1.mp3");

    await expect(transcribeAudioBook(file)).resolves.toMatchObject({
      author: "Lewis Carroll",
      chapters: [{ text: "Alice followed the White Rabbit." }],
      title: "Alice",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/transcriptions",
      expect.objectContaining({
        body: file,
        cache: "no-store",
        credentials: "same-origin",
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "audio/mpeg",
          "x-audio-file-name": "Alice%20Chapter%201.mp3",
        }),
      }),
    );
  });

  it("rejects malformed transcript ranges instead of trusting server JSON", async () => {
    const payload = validPayload();
    payload.transcript.chapters[0].endMs = 99_000;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200 }),
      ),
    );

    await expect(transcribeAudioBook(audioFile())).rejects.toEqual(
      new TranscriptionsApiError(
        "The local transcript returned invalid review data. Choose the file again.",
        200,
        true,
      ),
    );
  });

  it("preserves a bounded actionable server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error:
              "Local transcription is not installed. Install the approved Whisper model before importing audio.",
          }),
          { status: 503 },
        ),
      ),
    );

    await expect(transcribeAudioBook(audioFile())).rejects.toMatchObject({
      message:
        "Local transcription is not installed. Install the approved Whisper model before importing audio.",
      retryable: true,
      status: 503,
    });
  });

  it("rejects an unsupported file before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      transcribeAudioBook(audioFile("protected.aax", "audio/aax")),
    ).rejects.toMatchObject({
      message: "Choose an MP3 or M4B audiobook recording.",
      retryable: false,
      status: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
