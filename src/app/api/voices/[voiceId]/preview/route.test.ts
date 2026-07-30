import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { generateMockWav } from "@/lib/backend/mock-audio";
import {
  VOICE_CATALOG,
  VOICE_PREVIEW_TEXT,
} from "@/lib/voices/catalog";
import { GET } from "./route";

describe("voice preview route", () => {
  const createdDirectories: string[] = [];

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const directory of createdDirectories.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }
    delete process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT;
    delete process.env.ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_URL;
    delete process.env.ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_SECRET;
  });

  function configureDataRoot() {
    const directory = mkdtempSync(
      path.join(tmpdir(), "adaptive-audio-voice-preview-"),
    );
    createdDirectories.push(directory);
    process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT = directory;
    process.env.ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_URL =
      "http://127.0.0.1:8766";
    process.env.ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_SECRET = "c".repeat(64);
  }

  function mockSidecar(audio = generateMockWav("voice preview")) {
    const fetchMock = vi.fn(async () =>
      new Response(audio, {
        headers: {
          "Content-Length": String(audio.length),
          "Content-Type": "audio/wav",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  function request(
    voiceId: string,
    options: { range?: string; url?: string } = {},
  ) {
    return GET(
      new Request(
        options.url ??
          `http://localhost/api/voices/${voiceId}/preview`,
        { headers: options.range ? { range: options.range } : undefined },
      ),
      { params: Promise.resolve({ voiceId }) },
    );
  }

  it("defines stable product voices with exact Kokoro engine mappings", () => {
    expect(VOICE_CATALOG).toEqual([
      expect.objectContaining({
        id: "marlowe",
        displayName: "Marlowe",
        engineVoiceId: "af_heart",
      }),
      expect.objectContaining({
        id: "sloane",
        displayName: "Sloane",
        engineVoiceId: "af_bella",
      }),
      expect.objectContaining({
        id: "jules",
        displayName: "Jules",
        engineVoiceId: "am_michael",
      }),
      expect.objectContaining({
        id: "chatterbox-default",
        displayName: "High Quality Narrator",
        engineVoiceId: "chatterbox-default",
        narrationEngineId: "chatterbox",
      }),
    ]);
    for (const voice of VOICE_CATALOG) {
      expect(voice.description.trim().length).toBeGreaterThan(0);
    }
    expect(VOICE_PREVIEW_TEXT.length).toBeGreaterThan(20);
    expect(VOICE_PREVIEW_TEXT.length).toBeLessThanOrEqual(240);
  });

  it("renders each public voice with its mapped engine voice and fixed text", async () => {
    configureDataRoot();
    const fetchMock = mockSidecar();

    for (const [index, voice] of VOICE_CATALOG.entries()) {
      const response = await request(voice.id, {
        url: `http://localhost/api/voices/${voice.id}/preview?engine=${voice.narrationEngineId}&text=ignored-manuscript`,
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("audio/wav");
      expect(Buffer.from(await response.arrayBuffer()).length).toBeGreaterThan(44);
      const sidecarRequest = fetchMock.mock.calls[index] as unknown as [
        string,
        RequestInit,
      ];
      expect(JSON.parse(String(sidecarRequest[1].body))).toEqual({
        speed: 1,
        text: VOICE_PREVIEW_TEXT,
        voice: voice.engineVoiceId,
      });
    }
  });

  it("serves previews without workspace or account cookies", async () => {
    configureDataRoot();
    mockSidecar();

    const response = await request(" MARLOWE ");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(Buffer.from(await response.arrayBuffer()).length).toBeGreaterThan(44);
  });

  it("returns a generic 404 for unknown IDs without calling or exposing the catalog", async () => {
    configureDataRoot();
    const fetchMock = mockSidecar();

    const response = await request("af_heart");
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body).not.toContain("marlowe");
    expect(body).not.toContain("af_heart");
    expect(body).not.toContain("sloane");
  });

  it("reuses the persisted preview cache instead of calling the sidecar twice", async () => {
    configureDataRoot();
    const fetchMock = mockSidecar();

    expect((await request("sloane")).status).toBe(200);
    expect((await request("sloane")).status).toBe(200);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("streams cached preview byte ranges", async () => {
    configureDataRoot();
    const fetchMock = mockSidecar();
    expect((await request("jules")).status).toBe(200);

    const response = await request("jules", { range: "bytes=0-3" });

    expect(response.status).toBe(206);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-range")).toMatch(/^bytes 0-3\//);
    expect(Buffer.from(await response.arrayBuffer()).toString("ascii")).toBe(
      "RIFF",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns an actionable bounded error when the local sidecar fails", async () => {
    configureDataRoot();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect C:\\private\\kokoro-model.bin");
      }),
    );

    const response = await request("marlowe");
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain("Voice preview is temporarily unavailable");
    expect(body).not.toContain("C:\\private");
    expect(body).not.toContain("kokoro-model.bin");
  });
});
