import { describe, expect, it, vi } from "vitest";

import {
  executeGenerationJob,
  splitTextForTts,
} from "../../../scripts/job-worker-lib.mjs";

function createJob(kind = "sample-generation") {
  return {
    id: `job-${kind}`,
    workspaceId: "workspace-worker",
    kind,
    status: "running",
    createdAt: "2026-07-18T12:00:00.000Z",
    completedAt: null,
    errorMessage: null,
    books: 0,
    profiles: 0,
    playbackStates: 0,
    bookId: "book-worker",
    bookTitle: "Worker Book",
    engineId: "kokoro",
    narratorId: "sloane",
    mode: "classic",
    chapterCount: kind === "full-book-generation" ? 2 : 1,
    renderProgress: null,
    playableArtifactKind: null,
    resumePath: null,
  };
}

type TestJob = ReturnType<typeof createJob>;
type TestCompletionResult =
  | { ok: true; job: TestJob }
  | {
      ok: false;
      code: "state-conflict";
      message: string;
      currentStatus: string;
      job: TestJob;
    };

function createHarness(kind = "sample-generation") {
  const job = createJob(kind);
  const liveAssets = new Set<string>();
  const liveParts = new Set<string>();
  let assetNumber = 0;
  let partNumber = 0;
  let status = "running";

  const dependencies = {
    getGenerationJob: vi.fn(() => ({ ...job, status })),
    getSyncedBookDraftText: vi.fn(() => "Chapter 1\nFirst\nChapter 2\nSecond"),
    synthesizeAudio: vi.fn(async () => ({
      data: Buffer.from(`audio-${assetNumber + 1}`),
      mimeType: "audio/wav",
      extension: "wav",
      provider: "kokoro-local",
    })),
    stitchWavAudioAssets: vi.fn((buffers: Buffer[]) => Buffer.concat(buffers)),
    writeGeneratedAudioPart: vi.fn(() => {
      partNumber += 1;
      const relativePath = `generated/.parts/part-${partNumber}.wav`;
      liveParts.add(relativePath);
      return {
        absolutePath: `D:/adaptive-audio-player/${relativePath}`,
        relativePath,
      };
    }),
    deleteGeneratedAudioPart: vi.fn((relativePath: string) =>
      liveParts.delete(relativePath),
    ),
    assembleGeneratedWavParts: vi.fn(
      (input: { partPaths: string[] }) => {
        for (const partPath of input.partPaths) {
          liveParts.delete(partPath);
        }

        assetNumber += 1;
        const relativePath = `generated/full-${assetNumber}.wav`;
        liveAssets.add(relativePath);
        return {
          absolutePath: `D:/adaptive-audio-player/${relativePath}`,
          relativePath,
          peakBufferBytes: 64 * 1024,
        };
      },
    ),
    writeGeneratedAudioAsset: vi.fn(() => {
      assetNumber += 1;
      const relativePath = `generated/asset-${assetNumber}.wav`;
      liveAssets.add(relativePath);
      return {
        absolutePath: `D:/adaptive-audio-player/${relativePath}`,
        relativePath,
      };
    }),
    deleteGeneratedAudioAsset: vi.fn((relativePath: string) =>
      liveAssets.delete(relativePath),
    ),
    completeGenerationJob: vi.fn((): TestCompletionResult => ({
      ok: true,
      job: { ...job, status: "completed" },
    })),
    updateGenerationJobProgress: vi.fn(),
  };

  return {
    dependencies,
    job,
    liveAssets,
    liveParts,
    run: () => executeGenerationJob(job, dependencies),
    setStatus(nextStatus: string) {
      status = nextStatus;
    },
  };
}

describe("executeGenerationJob", () => {
  it("uses bounded sentence-aware chunks for High Quality narration", () => {
    const sentence = `${"A natural phrase ".repeat(16).trim()}.`;
    const text = Array.from({ length: 12 }, () => sentence).join(" ");
    const chunks = splitTextForTts(text, 900);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 900)).toBe(true);
    expect(chunks.every((chunk) => chunk.endsWith("."))).toBe(true);
    expect(chunks.join(" ")).toBe(text);
  });

  it("preserves the selected engine through worker synthesis", async () => {
    const harness = createHarness();
    harness.job.engineId = "chatterbox";
    harness.job.narratorId = "chatterbox-default";

    await expect(harness.run()).resolves.toEqual({
      status: "completed",
      currentStatus: "completed",
    });
    expect(harness.dependencies.synthesizeAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        engineId: "chatterbox",
        narratorId: "chatterbox-default",
      }),
    );
  });

  it("stops before calling synthesis when the job was cancelled", async () => {
    const harness = createHarness();
    harness.setStatus("cancelled");

    await expect(harness.run()).resolves.toEqual({
      status: "stopped",
      currentStatus: "cancelled",
    });
    expect(harness.dependencies.synthesizeAudio).not.toHaveBeenCalled();
    expect(harness.dependencies.writeGeneratedAudioAsset).not.toHaveBeenCalled();
    expect(harness.dependencies.completeGenerationJob).not.toHaveBeenCalled();
    expect(harness.liveAssets).toHaveLength(0);
  });

  it("rechecks cancellation while a synthesis call is in flight", async () => {
    const harness = createHarness();
    let resolveSynthesis:
      | ((
          audio: Awaited<
            ReturnType<typeof harness.dependencies.synthesizeAudio>
          >,
        ) => void)
      | undefined;
    harness.dependencies.synthesizeAudio.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSynthesis = resolve;
        }),
    );

    const execution = harness.run();
    await vi.waitFor(() => {
      expect(harness.dependencies.synthesizeAudio).toHaveBeenCalledTimes(1);
    });
    harness.setStatus("cancelled");
    resolveSynthesis?.({
      data: Buffer.from("audio"),
      mimeType: "audio/wav",
      extension: "wav",
      provider: "kokoro-local",
    });

    await expect(execution).resolves.toEqual({
      status: "stopped",
      currentStatus: "cancelled",
    });
    expect(harness.dependencies.writeGeneratedAudioAsset).not.toHaveBeenCalled();
    expect(harness.dependencies.completeGenerationJob).not.toHaveBeenCalled();
    expect(harness.liveAssets).toHaveLength(0);
  });

  it("rechecks again after synthesis before publishing an artifact", async () => {
    const harness = createHarness();
    harness.dependencies.getGenerationJob
      .mockReturnValueOnce({ ...harness.job, status: "running" })
      .mockReturnValueOnce({ ...harness.job, status: "running" })
      .mockReturnValueOnce({ ...harness.job, status: "cancelled" });

    await expect(harness.run()).resolves.toEqual({
      status: "stopped",
      currentStatus: "cancelled",
    });
    expect(harness.dependencies.synthesizeAudio).toHaveBeenCalledTimes(1);
    expect(harness.dependencies.writeGeneratedAudioAsset).not.toHaveBeenCalled();
    expect(harness.dependencies.completeGenerationJob).not.toHaveBeenCalled();
    expect(harness.liveAssets).toHaveLength(0);
  });

  it("deletes an unpublished sample when cancellation wins before completion", async () => {
    const harness = createHarness();
    harness.dependencies.writeGeneratedAudioAsset.mockImplementationOnce(() => {
      const relativePath = "generated/unpublished-sample.wav";
      harness.liveAssets.add(relativePath);
      harness.setStatus("cancelled");
      return {
        absolutePath: `D:/adaptive-audio-player/${relativePath}`,
        relativePath,
      };
    });

    await expect(harness.run()).resolves.toEqual({
      status: "stopped",
      currentStatus: "cancelled",
    });
    expect(harness.dependencies.completeGenerationJob).not.toHaveBeenCalled();
    expect(harness.dependencies.deleteGeneratedAudioAsset).toHaveBeenCalledWith(
      "generated/unpublished-sample.wav",
    );
    expect(harness.liveAssets).toHaveLength(0);
  });

  it("deletes a temporary part when cancellation happens between chapters", async () => {
    const harness = createHarness("full-book-generation");
    harness.dependencies.writeGeneratedAudioPart.mockImplementationOnce(() => {
      const relativePath = "generated/.parts/unpublished-chapter-1.wav";
      harness.liveParts.add(relativePath);
      harness.setStatus("cancelled");
      return {
        absolutePath: `D:/adaptive-audio-player/${relativePath}`,
        relativePath,
      };
    });

    await expect(harness.run()).resolves.toEqual({
      status: "stopped",
      currentStatus: "cancelled",
    });
    expect(harness.dependencies.synthesizeAudio).toHaveBeenCalledTimes(1);
    expect(harness.dependencies.writeGeneratedAudioPart).toHaveBeenCalledTimes(1);
    expect(harness.dependencies.deleteGeneratedAudioPart).toHaveBeenCalledWith(
      "generated/.parts/unpublished-chapter-1.wav",
    );
    expect(harness.dependencies.completeGenerationJob).not.toHaveBeenCalled();
    expect(harness.liveAssets).toHaveLength(0);
    expect(harness.liveParts).toHaveLength(0);
  });

  it("cleans all temporary chapter output when synthesis fails", async () => {
    const harness = createHarness("full-book-generation");
    harness.dependencies.synthesizeAudio
      .mockResolvedValueOnce({
        data: Buffer.from("chapter-1"),
        mimeType: "audio/wav",
        extension: "wav",
        provider: "kokoro-local",
      })
      .mockRejectedValueOnce(new Error("sidecar failed"));

    await expect(harness.run()).rejects.toThrow("sidecar failed");
    expect(harness.dependencies.deleteGeneratedAudioPart).toHaveBeenCalledWith(
      "generated/.parts/part-1.wav",
    );
    expect(harness.dependencies.completeGenerationJob).not.toHaveBeenCalled();
    expect(harness.liveAssets).toHaveLength(0);
    expect(harness.liveParts).toHaveLength(0);
  });

  it("assembles a full book from temporary parts without publishing part paths", async () => {
    const harness = createHarness("full-book-generation");

    await expect(harness.run()).resolves.toEqual({
      status: "completed",
      currentStatus: "completed",
    });
    expect(harness.dependencies.writeGeneratedAudioPart).toHaveBeenCalledTimes(2);
    expect(harness.dependencies.assembleGeneratedWavParts).toHaveBeenCalledWith(
      expect.objectContaining({
        partPaths: [
          "generated/.parts/part-1.wav",
          "generated/.parts/part-2.wav",
        ],
      }),
    );
    expect(harness.dependencies.completeGenerationJob).toHaveBeenCalledWith(
      harness.job.id,
      harness.job.workspaceId,
      expect.not.objectContaining({
        chapterAssetPaths: expect.anything(),
        chapterArtifacts: expect.anything(),
      }),
    );
    expect(harness.liveParts).toHaveLength(0);
    expect(harness.liveAssets).toEqual(new Set(["generated/full-1.wav"]));
  });

  it("cleans output when atomic completion reports a cancellation conflict", async () => {
    const harness = createHarness();
    harness.dependencies.completeGenerationJob.mockReturnValueOnce({
      ok: false,
      code: "state-conflict",
      message: "Generation job cannot complete from cancelled status.",
      currentStatus: "cancelled",
      job: { ...harness.job, status: "cancelled" },
    });

    await expect(harness.run()).resolves.toEqual({
      status: "stopped",
      currentStatus: "cancelled",
    });
    expect(harness.dependencies.deleteGeneratedAudioAsset).toHaveBeenCalledWith(
      "generated/asset-1.wav",
    );
    expect(harness.liveAssets).toHaveLength(0);
  });

  it("keeps successfully published output", async () => {
    const harness = createHarness();

    await expect(harness.run()).resolves.toEqual({
      status: "completed",
      currentStatus: "completed",
    });
    expect(harness.dependencies.completeGenerationJob).toHaveBeenCalledTimes(1);
    expect(harness.dependencies.deleteGeneratedAudioAsset).not.toHaveBeenCalled();
    expect(harness.liveAssets).toEqual(new Set(["generated/asset-1.wav"]));
  });
});
