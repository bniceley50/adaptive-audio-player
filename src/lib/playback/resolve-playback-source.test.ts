import { describe, expect, it } from "vitest";

import type { PublicGenerationOutputSummary } from "@/lib/backend/types";
import { resolvePlaybackSource } from "./resolve-playback-source";

const narratorNames = {
  marlowe: "Marlowe",
  sloane: "Sloane",
};

function output(
  overrides: Partial<PublicGenerationOutputSummary> = {},
): PublicGenerationOutputSummary {
  return {
    artifactId: "artifact-current",
    artifactUrl:
      "/api/audio/generated/artifacts/artifact-current?source=jobs",
    bookId: "book-1",
    chapterArtifacts: [],
    chapterCount: 1,
    chapterIndex: null,
    chapterTitle: null,
    generatedAt: "2026-07-18T12:00:00.000Z",
    isChapterArtifact: false,
    isCurrent: true,
    jobId: "job-current",
    kind: "sample-generation",
    mimeType: "audio/wav",
    mode: "narration",
    narratorId: "sloane",
    provider: "kokoro-local",
    ...overrides,
  };
}

function artifact(
  overrides: Partial<PublicGenerationOutputSummary> = {},
): PublicGenerationOutputSummary {
  return {
    ...output({
      artifactId: "artifact-1",
      artifactUrl: "/api/audio/generated/artifacts/artifact-1",
      generatedAt: "2026-07-17T12:00:00.000Z",
      isCurrent: false,
      jobId: "job-1",
    }),
    ...overrides,
  };
}

describe("resolvePlaybackSource", () => {
  it("resolves a concrete current sample with its recorded metadata", () => {
    const result = resolvePlaybackSource({
      artifacts: [],
      bookId: "book-1",
      currentOutputs: [output()],
      narratorNames,
      requestedKind: "sample-generation",
    });

    expect(result).toEqual({
      artifactId: "artifact-current",
      artifactKind: "sample-generation",
      audioUrl:
        "/api/audio/generated/artifacts/artifact-current?source=jobs",
      isReady: true,
      narratorId: "sloane",
      narratorName: "Sloane",
      version: "current",
    });
  });

  it("resolves a concrete current full book without inventing missing narrator metadata", () => {
    const result = resolvePlaybackSource({
      artifacts: [],
      bookId: "book-1",
      currentOutputs: [
        output({
          artifactId: "artifact-full",
          artifactUrl: "/api/audio/generated/artifacts/artifact-full",
          kind: "full-book-generation",
          mode: null,
          narratorId: null,
        }),
      ],
      narratorNames,
      requestedKind: "full-book-generation",
    });

    expect(result).toMatchObject({
      artifactId: "artifact-full",
      artifactKind: "full-book-generation",
      audioUrl: "/api/audio/generated/artifacts/artifact-full",
      isReady: true,
      narratorId: null,
      narratorName: "Narrator unavailable",
      version: "current",
    });
  });

  it("resolves an archived artifact by ID and uses the artifact metadata", () => {
    const result = resolvePlaybackSource({
      artifacts: [artifact()],
      bookId: "book-1",
      currentOutputs: [output()],
      narratorNames,
      requestedArtifactId: "artifact-1",
    });

    expect(result).toMatchObject({
      artifactId: "artifact-1",
      artifactKind: "sample-generation",
      audioUrl: "/api/audio/generated/artifacts/artifact-1",
      isReady: true,
      narratorId: "sloane",
      narratorName: "Sloane",
      version: "archived",
    });
  });

  it("treats a missing explicit artifact as unavailable without falling back", () => {
    const result = resolvePlaybackSource({
      artifacts: [],
      bookId: "book-1",
      currentOutputs: [output()],
      narratorNames,
      requestedArtifactId: "missing-artifact",
    });

    expect(result).toMatchObject({
      artifactId: null,
      artifactKind: null,
      audioUrl: null,
      isReady: false,
      version: null,
    });
  });

  it("rejects an explicit artifact belonging to another book", () => {
    const result = resolvePlaybackSource({
      artifacts: [artifact({ bookId: "book-2" })],
      bookId: "book-1",
      currentOutputs: [output()],
      narratorNames,
      requestedArtifactId: "artifact-1",
    });

    expect(result.isReady).toBe(false);
    expect(result.audioUrl).toBeNull();
  });

  it("uses the server-provided currentness for an explicit artifact", () => {
    const result = resolvePlaybackSource({
      artifacts: [artifact({ isCurrent: true })],
      bookId: "book-1",
      currentOutputs: [],
      narratorNames,
      requestedArtifactId: "artifact-1",
    });

    expect(result.isReady).toBe(true);
    expect(result.version).toBe("current");
  });

  it("does not let unrelated query labels replace recorded artifact metadata", () => {
    const inputWithUntrustedLabels = {
      artifacts: [artifact()],
      bookId: "book-1",
      currentOutputs: [output()],
      narratorNames,
      queryMode: "immersive",
      queryNarratorId: "marlowe",
      requestedArtifactId: "artifact-1",
    };

    const result = resolvePlaybackSource(inputWithUntrustedLabels);

    expect(result.narratorName).toBe("Sloane");
    expect(result).not.toHaveProperty("mode");
  });
});
