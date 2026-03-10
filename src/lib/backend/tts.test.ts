import { afterEach, describe, expect, it } from "vitest";

import { synthesizeAudio } from "@/lib/backend/tts";

describe("synthesizeAudio", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it("falls back to deterministic mock audio when no API key is set", async () => {
    delete process.env.OPENAI_API_KEY;

    const result = await synthesizeAudio({
      text: "Storm Harbor sample chapter.",
      narratorId: "sloane",
      mode: "immersive",
    });

    expect(result.provider).toBe("mock");
    expect(result.mimeType).toBe("audio/wav");
    expect(result.extension).toBe("wav");
    expect(result.data.subarray(0, 4).toString()).toBe("RIFF");
  });
});
