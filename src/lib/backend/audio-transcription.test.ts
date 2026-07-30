import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  AudioTranscriptionError,
  transcribeUploadedAudio,
  verifyWhisperModelFile,
} from "@/lib/backend/audio-transcription";

const createdDirectories: string[] = [];

async function createTemporaryDirectory(name: string) {
  const directory = await mkdtemp(path.join(tmpdir(), name));
  createdDirectories.push(directory);
  return directory;
}

function streamBytes(...chunks: number[][]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(Uint8Array.from(chunk));
      }
      controller.close();
    },
  });
}

afterEach(async () => {
  for (const directory of createdDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("audio transcription backend", () => {
  it("verifies a regular model file by exact size and SHA-256", async () => {
    const runtimeRoot = await createTemporaryDirectory("adaptive-whisper-model-");
    const modelPath = path.join(runtimeRoot, "model.bin");
    const bytes = Buffer.from("verified whisper model");
    await writeFile(modelPath, bytes);

    await expect(
      verifyWhisperModelFile({
        modelPath,
        expectedBytes: bytes.byteLength,
        expectedSha256: createHash("sha256").update(bytes).digest("hex"),
      }),
    ).resolves.toBe(runtimeRoot);

    await expect(
      verifyWhisperModelFile({
        modelPath,
        expectedBytes: bytes.byteLength,
        expectedSha256: "0".repeat(64),
      }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("streams a private upload, returns a review draft, and removes intermediates", async () => {
    const dataRoot = await createTemporaryDirectory("adaptive-transcription-data-");
    const modelRoot = await createTemporaryDirectory("adaptive-transcription-model-");
    const calls: Array<{ args: string[]; command: string; cwd?: string }> = [];

    const draft = await transcribeUploadedAudio(
      {
        body: streamBytes([1, 2], [3, 4]),
        contentLength: 4,
        fileName: "alice.mp3",
        mimeType: "audio/mpeg",
      },
      {
        dataRoot,
        verifyModel: async () => modelRoot,
        runProcess: async (input) => {
          calls.push({ command: input.command, args: input.args, cwd: input.cwd });
          if (input.command === "ffprobe") {
            const sourcePath = input.args.at(-1);
            expect(sourcePath).toBeTruthy();
            await expect(readFile(sourcePath!)).resolves.toEqual(
              Buffer.from([1, 2, 3, 4]),
            );
            return {
              stderr: "",
              stdout: JSON.stringify({
                format: {
                  duration: "12.5",
                  format_name: "mp3",
                  tags: { artist: "Lewis Carroll", title: "Alice" },
                },
                streams: [{ codec_type: "audio", codec_tag_string: "mp3" }],
              }),
            };
          }

          const filter = input.args[input.args.indexOf("-af") + 1];
          const destination = filter
            .split(":")
            .find((part) => part.startsWith("destination="))
            ?.slice("destination=".length);
          expect(input.cwd).toBe(modelRoot);
          expect(filter).toContain("model=ggml-base.en.bin");
          expect(destination).toMatch(/^transcript-[0-9a-f-]+\.json$/);
          await writeFile(
            path.join(input.cwd!, destination!),
            [
              JSON.stringify({ start: 0, end: 4_000, text: "Down the rabbit hole." }),
              JSON.stringify({ start: 4_100, end: 8_000, text: "Alice followed." }),
            ].join("\n"),
          );
          return { stderr: "", stdout: "" };
        },
      },
    );

    expect(draft).toEqual({
      album: null,
      author: "Lewis Carroll",
      durationSeconds: 12.5,
      sourceFileName: "alice.mp3",
      title: "Alice",
      chapters: [
        {
          endMs: 12_500,
          id: "chapter-1",
          order: 0,
          startMs: 0,
          text: "Down the rabbit hole. Alice followed.",
          title: "Alice",
        },
      ],
    });
    expect(calls).toHaveLength(2);
    expect(calls[1].args).toContain("NUL");
    await expect(readdir(path.join(dataRoot, "transcription-temp"))).resolves.toEqual([]);
    await expect(readdir(modelRoot)).resolves.toEqual([]);
  });

  it("fails closed on incomplete uploads and removes the temporary file", async () => {
    const dataRoot = await createTemporaryDirectory("adaptive-transcription-incomplete-");
    await expect(
      transcribeUploadedAudio(
        {
          body: streamBytes([1, 2, 3]),
          contentLength: 4,
          fileName: "alice.m4b",
          mimeType: "audio/mp4",
        },
        {
          dataRoot,
          maximumUploadBytes: 16,
          verifyModel: async () => {
            throw new Error("must not run");
          },
        },
      ),
    ).rejects.toEqual(
      new AudioTranscriptionError(
        "The audio upload was incomplete. Choose the file again.",
        400,
      ),
    );

    await mkdir(path.join(dataRoot, "transcription-temp"), { recursive: true });
    await expect(readdir(path.join(dataRoot, "transcription-temp"))).resolves.toEqual([]);
  });
});
