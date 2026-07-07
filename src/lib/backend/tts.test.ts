import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { synthesizeAudio } from "@/lib/backend/tts";

describe("synthesizeAudio", () => {
  const originalTtsUrl = process.env.ADAPTIVE_AUDIO_PLAYER_TTS_URL;
  const originalTtsTimeoutMs = process.env.ADAPTIVE_AUDIO_PLAYER_TTS_TIMEOUT_MS;
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.unstubAllGlobals();

    if (originalTtsUrl === undefined) {
      delete process.env.ADAPTIVE_AUDIO_PLAYER_TTS_URL;
    } else {
      process.env.ADAPTIVE_AUDIO_PLAYER_TTS_URL = originalTtsUrl;
    }

    if (originalTtsTimeoutMs === undefined) {
      delete process.env.ADAPTIVE_AUDIO_PLAYER_TTS_TIMEOUT_MS;
    } else {
      process.env.ADAPTIVE_AUDIO_PLAYER_TTS_TIMEOUT_MS = originalTtsTimeoutMs;
    }

    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("renders through the local sidecar and reads the generated WAV", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-tts-"));
    tempDirs.push(tempDir);
    const audioPath = path.join(tempDir, "sample.wav");
    writeFileSync(audioPath, Buffer.from("RIFFlocal-kokoro-audio"));
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          ok: true,
          provider: "kokoro-local",
          audioPath,
          mimeType: "audio/wav",
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    process.env.ADAPTIVE_AUDIO_PLAYER_TTS_URL = "http://127.0.0.1:8765";

    const result = await synthesizeAudio({
      text: " Storm Harbor sample chapter. ",
      narratorId: "sloane",
      mode: "immersive",
    });

    expect(result.provider).toBe("kokoro-local");
    expect(result.mimeType).toBe("audio/wav");
    expect(result.extension).toBe("wav");
    expect(result.data.toString()).toBe("RIFFlocal-kokoro-audio");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8765/render",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          text: "Storm Harbor sample chapter.",
          voice: "sloane",
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
        mode: "ambient",
      }),
    ).rejects.toThrow(
      "Local TTS sidecar is not reachable. Start the Kokoro sidecar before generating audio.",
    );
  });

  it("reports sidecar job errors instead of returning substitute audio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            detail: "Kokoro model weight verification failed.",
          }),
          { status: 503 },
        );
      }),
    );

    await expect(
      synthesizeAudio({
        text: "A real sample needs verified local weights.",
        narratorId: "marlowe",
        mode: "ambient",
      }),
    ).rejects.toThrow(
      "Local TTS sidecar failed: Kokoro model weight verification failed.",
    );
  });
});
