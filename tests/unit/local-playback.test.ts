import { describe, expect, it } from "vitest";

import {
  resolvePreferredPlaybackState,
  type PersistedPlaybackState,
} from "@/lib/playback/local-playback";

function buildPlaybackState(
  updatedAt: string,
  progressSeconds: number,
): PersistedPlaybackState {
  return {
    currentChapterIndex: 0,
    progressSeconds,
    speed: 1,
    isBookmarked: false,
    sleepTimerMinutes: null,
    playbackArtifactKind: "sample-generation",
    bookmarks: [],
    updatedAt,
  };
}

describe("resolvePreferredPlaybackState", () => {
  it("returns backend state when local state is missing", () => {
    const backendState = buildPlaybackState("2026-03-11T10:00:00.000Z", 120);

    expect(resolvePreferredPlaybackState(null, backendState)).toEqual(backendState);
  });

  it("returns the newer backend state when it is fresher than local", () => {
    const localState = buildPlaybackState("2026-03-11T10:00:00.000Z", 45);
    const backendState = buildPlaybackState("2026-03-11T10:05:00.000Z", 90);

    expect(resolvePreferredPlaybackState(localState, backendState)).toEqual(
      backendState,
    );
  });

  it("keeps the local state when it is newer than backend", () => {
    const localState = buildPlaybackState("2026-03-11T10:05:00.000Z", 90);
    const backendState = buildPlaybackState("2026-03-11T10:00:00.000Z", 45);

    expect(resolvePreferredPlaybackState(localState, backendState)).toEqual(
      localState,
    );
  });
});
