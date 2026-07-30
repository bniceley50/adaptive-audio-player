import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_TTS_AUDIO_RESPONSE_BYTES,
  synthesizeAudio,
  TTS_SECRET_HEADER,
} from "@/lib/backend/tts";

function createValidPcmWav() {
  const samples = Buffer.from([0, 0, 16, 0, 240, 255, 0, 0]);
  const wav = Buffer.alloc(44 + samples.length);

  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24_000, 24);
  wav.writeUInt32LE(48_000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(samples.length, 40);
  samples.copy(wav, 44);

  return wav;
}

function audioResponse(
  data: BodyInit,
  headers: Record<string, string> = {},
) {
  return new Response(data, {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      ...headers,
    },
  });
}

describe("synthesizeAudio", () => {
  const originalTtsUrl = process.env.ADAPTIVE_AUDIO_PLAYER_TTS_URL;
  const originalTtsSecret = process.env.ADAPTIVE_AUDIO_PLAYER_TTS_SECRET;
  const originalTtsTimeoutMs = process.env.ADAPTIVE_AUDIO_PLAYER_TTS_TIMEOUT_MS;
  const originalChatterboxUrl =
    process.env.ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_URL;
  const originalChatterboxSecret =
    process.env.ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_SECRET;

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();

    if (originalTtsUrl === undefined) {
      delete process.env.ADAPTIVE_AUDIO_PLAYER_TTS_URL;
    } else {
      process.env.ADAPTIVE_AUDIO_PLAYER_TTS_URL = originalTtsUrl;
    }

    if (originalTtsSecret === undefined) {
      delete process.env.ADAPTIVE_AUDIO_PLAYER_TTS_SECRET;
    } else {
      process.env.ADAPTIVE_AUDIO_PLAYER_TTS_SECRET = originalTtsSecret;
    }

    if (originalTtsTimeoutMs === undefined) {
      delete process.env.ADAPTIVE_AUDIO_PLAYER_TTS_TIMEOUT_MS;
    } else {
      process.env.ADAPTIVE_AUDIO_PLAYER_TTS_TIMEOUT_MS = originalTtsTimeoutMs;
    }

    if (originalChatterboxUrl === undefined) {
      delete process.env.ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_URL;
    } else {
      process.env.ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_URL = originalChatterboxUrl;
    }
    if (originalChatterboxSecret === undefined) {
      delete process.env.ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_SECRET;
    } else {
      process.env.ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_SECRET =
        originalChatterboxSecret;
    }
  });

  it("returns a typed WAV result from sidecar response bytes", async () => {
    const wav = createValidPcmWav();
    const fetchMock = vi.fn(async () =>
      audioResponse(wav, { "Content-Length": String(wav.length) }),
    );
    vi.stubGlobal("fetch", fetchMock);
    process.env.ADAPTIVE_AUDIO_PLAYER_TTS_URL = "http://127.0.0.1:8765";
    process.env.ADAPTIVE_AUDIO_PLAYER_TTS_SECRET = "a".repeat(64);

    const result = await synthesizeAudio({
      text: " Storm Harbor sample chapter. ",
      narratorId: "sloane",
      mode: "classic",
    });

    expect(result).toEqual({
      data: wav,
      mimeType: "audio/wav",
      extension: "wav",
      provider: "kokoro-local",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8765/render",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [TTS_SECRET_HEADER]: "a".repeat(64),
        },
        body: JSON.stringify({
          text: "Storm Harbor sample chapter.",
          voice: "sloane",
          speed: 1,
        }),
        signal: expect.any(AbortSignal),
      }),
    );
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(requestUrl).not.toContain("a".repeat(64));
    expect(requestInit.body).not.toContain("a".repeat(64));
  });

  it("routes High Quality requests to the authenticated Chatterbox sidecar", async () => {
    const wav = createValidPcmWav();
    const fetchMock = vi.fn(async () =>
      audioResponse(wav, { "Content-Length": String(wav.length) }),
    );
    vi.stubGlobal("fetch", fetchMock);
    process.env.ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_URL =
      "http://127.0.0.1:8766";
    process.env.ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_SECRET = "b".repeat(64);

    const result = await synthesizeAudio({
      text: "Use the safe local fallback.",
      narratorId: "chatterbox-default",
      mode: "classic",
      engineId: "chatterbox",
    });

    expect(result.provider).toBe("chatterbox-local");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8766/render",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          [TTS_SECRET_HEADER]: "b".repeat(64),
        },
        body: JSON.stringify({
          text: "Use the safe local fallback.",
          voice: "chatterbox-default",
          speed: 1,
        }),
      }),
    );
  });

  it("fails closed when text is empty", async () => {
    await expect(
      synthesizeAudio({
        text: "   ",
        narratorId: "marlowe",
        mode: "classic",
      }),
    ).rejects.toThrow("Text is required before local narration can run.");
  });

  it("fails closed when the sidecar is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    await expect(
      synthesizeAudio({
        text: "A real sample needs the local engine.",
        narratorId: "marlowe",
        mode: "classic",
      }),
    ).rejects.toThrow(
      "Local TTS sidecar is not reachable. Start the Kokoro sidecar before generating audio.",
    );
  });

  it("reports sidecar job errors instead of returning substitute audio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            detail: "Kokoro model weight verification failed.",
          }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await expect(
      synthesizeAudio({
        text: "A real sample needs verified local weights.",
        narratorId: "marlowe",
        mode: "classic",
      }),
    ).rejects.toThrow(
      "Local TTS sidecar failed: Kokoro model weight verification failed.",
    );
  });

  it("rejects a successful response with an invalid MIME type", async () => {
    const wav = createValidPcmWav();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(wav, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      synthesizeAudio({
        text: "Reject the wrong response type.",
        narratorId: "marlowe",
        mode: "classic",
      }),
    ).rejects.toThrow(
      "Local TTS sidecar returned an unsupported audio content type.",
    );
  });

  it("rejects a declared response larger than the audio limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        audioResponse(createValidPcmWav(), {
          "Content-Length": String(MAX_TTS_AUDIO_RESPONSE_BYTES + 1),
        }),
      ),
    );

    await expect(
      synthesizeAudio({
        text: "Reject oversized audio.",
        narratorId: "marlowe",
        mode: "classic",
      }),
    ).rejects.toThrow(
      "Local TTS sidecar returned more audio than the safe response limit.",
    );
  });

  it("stops streaming when an undeclared response crosses the audio limit", async () => {
    const chunk = new Uint8Array(4 * 1024 * 1024);
    const cancel = vi.fn(async () => undefined);
    const releaseLock = vi.fn();
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "audio/wav" }),
      body: {
        getReader: () => ({
          read: vi.fn(async () => ({ done: false as const, value: chunk })),
          cancel,
          releaseLock,
        }),
      },
    } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn(async () => response));

    await expect(
      synthesizeAudio({
        text: "Bound a streaming response too.",
        narratorId: "marlowe",
        mode: "classic",
      }),
    ).rejects.toThrow(
      "Local TTS sidecar returned more audio than the safe response limit.",
    );
    expect(cancel).toHaveBeenCalledOnce();
    expect(releaseLock).toHaveBeenCalledOnce();
  });

  it("times out while waiting for the complete audio response", async () => {
    vi.useFakeTimers();
    process.env.ADAPTIVE_AUDIO_PLAYER_TTS_TIMEOUT_MS = "25";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_input: string | URL | Request, init?: RequestInit) =>
          await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      ),
    );

    const assertion = expect(
      synthesizeAudio({
        text: "Do not wait forever.",
        narratorId: "marlowe",
        mode: "classic",
      }),
    ).rejects.toThrow(
      "Local TTS sidecar timed out before it returned audio. Make sure Kokoro is running and try a shorter sample.",
    );

    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });

  it("keeps the timeout active while the response body is streaming", async () => {
    vi.useFakeTimers();
    process.env.ADAPTIVE_AUDIO_PLAYER_TTS_TIMEOUT_MS = "25";
    const releaseLock = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const response = {
          ok: true,
          status: 200,
          headers: new Headers({ "Content-Type": "audio/wav" }),
          body: {
            getReader: () => ({
              read: async () =>
                await new Promise<never>((_resolve, reject) => {
                  init?.signal?.addEventListener("abort", () => {
                    reject(new DOMException("Aborted", "AbortError"));
                  });
                }),
              cancel: vi.fn(async () => undefined),
              releaseLock,
            }),
          },
        } as unknown as Response;
        return response;
      }),
    );

    const assertion = expect(
      synthesizeAudio({
        text: "Time out a stalled audio stream.",
        narratorId: "marlowe",
        mode: "classic",
      }),
    ).rejects.toThrow(
      "Local TTS sidecar timed out before it returned audio. Make sure Kokoro is running and try a shorter sample.",
    );

    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(releaseLock).toHaveBeenCalledOnce();
  });

  it.each([
    Buffer.from("not a wave file"),
    Buffer.from("RIFF\x04\x00\x00\x00WAVE", "binary"),
  ])("rejects corrupt WAV bytes", async (data) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        audioResponse(data, { "Content-Length": String(data.length) }),
      ),
    );

    await expect(
      synthesizeAudio({
        text: "Validate the WAV container.",
        narratorId: "marlowe",
        mode: "classic",
      }),
    ).rejects.toThrow("Local TTS sidecar returned corrupt WAV audio.");
  });
});
