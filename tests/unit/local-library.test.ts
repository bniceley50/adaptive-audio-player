import { describe, expect, it } from "vitest";

import { resolveSampleGenerationState } from "@/lib/library/local-library";

describe("resolveSampleGenerationState", () => {
  const selection = {
    bookId: "book-1",
    narratorId: "sloane",
    mode: "classic",
  };
  const request = { ...selection };

  function job(
    status: string,
    overrides: Partial<{
      bookId: string | null;
      id: string;
      mode: string | null;
      narratorId: string | null;
    }> = {},
  ) {
    return {
      id: "sample-job-1",
      bookId: selection.bookId,
      narratorId: selection.narratorId,
      mode: selection.mode,
      status,
      ...overrides,
    };
  }

  function artifact(
    overrides: Partial<{
      artifactId: string | null;
      artifactUrl: string;
      bookId: string;
      isCurrent: boolean;
      jobId: string | null;
      mode: string | null;
      narratorId: string | null;
    }> = {},
  ) {
    return {
      artifactId: "artifact-1",
      artifactUrl: "/api/audio/generated/artifacts/artifact-1",
      bookId: selection.bookId,
      narratorId: selection.narratorId,
      mode: selection.mode,
      isCurrent: true,
      jobId: "sample-job-1",
      ...overrides,
    };
  }

  function resolve({
    activeJob = null,
    output = null,
    sampleRequest = null,
  }: {
    activeJob?: ReturnType<typeof job> | null;
    output?: ReturnType<typeof artifact> | null;
    sampleRequest?: typeof request | null;
  } = {}) {
    return resolveSampleGenerationState({
      ...selection,
      job: activeJob,
      output,
      request: sampleRequest,
    });
  }

  it("represents requested, queued, and running states without playability", () => {
    expect(resolve({ sampleRequest: request })).toEqual({
      isPlayable: false,
      status: "requested",
    });
    expect(resolve({ activeJob: job("queued"), sampleRequest: request })).toEqual({
      isPlayable: false,
      status: "queued",
    });
    expect(resolve({ activeJob: job("running"), sampleRequest: request })).toEqual({
      isPlayable: false,
      status: "running",
    });
  });

  it("keeps failed and cancelled jobs non-playable after reload", () => {
    expect(resolve({ activeJob: job("failed"), sampleRequest: request })).toEqual({
      isPlayable: false,
      status: "failed",
    });
    expect(
      resolve({ activeJob: job("cancelled"), sampleRequest: request }),
    ).toEqual({
      isPlayable: false,
      status: "cancelled",
    });
  });

  it("treats an old request and a completed artifact for another voice as stale", () => {
    expect(
      resolve({
        sampleRequest: { ...request, narratorId: "jules" },
      }),
    ).toEqual({ isPlayable: false, status: "stale" });
    expect(
      resolve({
        activeJob: job("completed"),
        output: artifact({ narratorId: "jules" }),
        sampleRequest: request,
      }),
    ).toEqual({ isPlayable: false, status: "stale" });
  });

  it("does not unlock playback when completion has no accessible artifact", () => {
    expect(
      resolve({ activeJob: job("completed"), sampleRequest: request }),
    ).toEqual({ isPlayable: false, status: "missing-artifact" });
    expect(
      resolve({
        activeJob: job("completed"),
        output: artifact({ artifactUrl: "" }),
        sampleRequest: request,
      }),
    ).toEqual({ isPlayable: false, status: "missing-artifact" });
    expect(
      resolve({
        activeJob: job("completed"),
        output: artifact({ artifactId: null }),
        sampleRequest: request,
      }),
    ).toEqual({ isPlayable: false, status: "missing-artifact" });
    expect(
      resolve({
        activeJob: job("completed"),
        output: artifact({ jobId: "older-job" }),
        sampleRequest: request,
      }),
    ).toEqual({ isPlayable: false, status: "missing-artifact" });
  });

  it("unlocks playback only for the matching completed artifact", () => {
    expect(
      resolve({
        activeJob: job("completed"),
        output: artifact(),
        sampleRequest: request,
      }),
    ).toEqual({ isPlayable: true, status: "completed-with-artifact" });
  });
});
