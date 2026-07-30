/** @vitest-environment jsdom */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NowPlaying } from "./now-playing";
import {
  useMediaController,
  type MediaController,
  type MediaControllerOptions,
} from "./use-media-controller";

interface MockMediaState {
  currentTime: number;
  duration: number;
  error: MediaError | null;
  ignoredCurrentTimeWrites: number;
  paused: boolean;
  playbackRate: number;
  readyState: number;
  seekableEnd: number;
}

interface MockMedia {
  audio: HTMLAudioElement;
  pause: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  state: MockMediaState;
}

interface RenderedController {
  get controller(): MediaController;
  media: MockMedia;
  rerender: (options: MediaControllerOptions) => void;
}

const roots: Root[] = [];

function ControllerHarness({
  onRender,
  options,
}: {
  onRender: (controller: MediaController) => void;
  options: MediaControllerOptions;
}) {
  const controller = useMediaController(options);
  const { audioRef } = controller;

  useEffect(() => {
    onRender(controller);
  }, [controller, onRender]);

  return <audio ref={audioRef} />;
}

function mockMediaElement(audio: HTMLAudioElement): MockMedia {
  const state: MockMediaState = {
    currentTime: 0,
    duration: Number.NaN,
    error: null,
    ignoredCurrentTimeWrites: 0,
    paused: true,
    playbackRate: 1,
    readyState: 0,
    seekableEnd: 0,
  };
  const play = vi.fn(() => {
    state.paused = false;
    audio.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  const pause = vi.fn(() => {
    state.paused = true;
    audio.dispatchEvent(new Event("pause"));
  });

  Object.defineProperties(audio, {
    currentTime: {
      configurable: true,
      get: () => state.currentTime,
      set: (value: number) => {
        if (state.ignoredCurrentTimeWrites > 0) {
          state.ignoredCurrentTimeWrites -= 1;
          return;
        }
        state.currentTime = value;
      },
    },
    duration: {
      configurable: true,
      get: () => state.duration,
    },
    error: {
      configurable: true,
      get: () => state.error,
    },
    paused: {
      configurable: true,
      get: () => state.paused,
    },
    playbackRate: {
      configurable: true,
      get: () => state.playbackRate,
      set: (value: number) => {
        state.playbackRate = value;
      },
    },
    readyState: {
      configurable: true,
      get: () => state.readyState,
    },
    seekable: {
      configurable: true,
      get: () =>
        ({
          end: () => state.seekableEnd,
          length: state.seekableEnd > 0 ? 1 : 0,
          start: () => 0,
        }) as TimeRanges,
    },
    pause: {
      configurable: true,
      value: pause,
    },
    play: {
      configurable: true,
      value: play,
    },
  });

  return { audio, pause, play, state };
}

function renderController(options: MediaControllerOptions = {}): RenderedController {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  let currentController: MediaController | null = null;

  function render(nextOptions: MediaControllerOptions) {
    act(() => {
      root.render(
        <ControllerHarness
          onRender={(controller) => {
            currentController = controller;
          }}
          options={nextOptions}
        />,
      );
    });
  }

  render(options);
  const audio = container.querySelector("audio");
  if (!audio || !currentController) {
    throw new Error("Media controller test harness did not render an audio element.");
  }

  return {
    get controller() {
      if (!currentController) {
        throw new Error("Media controller test harness is unavailable.");
      }
      return currentController;
    },
    media: mockMediaElement(audio),
    rerender: render,
  };
}

function renderNowPlaying({
  artifactId = null,
  audioKind = "sample-generation",
  audioUrl = "/api/audio/generated/book-1?kind=sample-generation",
  chapters = [
    {
      id: "chapter-1",
      order: 0,
      text: "A chapter used to verify real media playback.",
      title: "Chapter One",
    },
  ],
  chapterTimings = [],
  playbackIsReady = true,
}: {
  artifactId?: string | null;
  audioKind?: "sample-generation" | "full-book-generation";
  audioUrl?: string | null;
  chapters?: React.ComponentProps<typeof NowPlaying>["chapters"];
  chapterTimings?: React.ComponentProps<typeof NowPlaying>["chapterTimings"];
  playbackIsReady?: boolean;
} = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);

  act(() => {
    root.render(
      <NowPlaying
        artifactId={artifactId}
        audioKind={audioKind}
        audioUrl={audioUrl}
        bookId="book-1"
        bookTitle="The Test Book"
        chapters={chapters}
        chapterTimings={chapterTimings}
        narratorName="Sloane"
        playbackIsReady={playbackIsReady}
      />,
    );
  });

  const audio = container.querySelector("audio");
  if (!audio) {
    throw new Error("NowPlaying did not render its audio element.");
  }

  return {
    container,
    media: mockMediaElement(audio),
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
});

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    act(() => root?.unmount());
  }
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useMediaController", () => {
  it("starts new audio at zero and restores an explicit persisted position", () => {
    const freshPlayback = renderController({ sourceKey: "/fresh.wav" });
    const resumedPlayback = renderController({
      initialTime: 37,
      sourceKey: "/resumed.wav",
    });

    expect(freshPlayback.controller.currentTime).toBe(0);
    expect(resumedPlayback.controller.currentTime).toBe(37);
  });

  it("reapplies persisted progress after delayed media metadata loads", () => {
    const rendered = renderController({
      initialTime: 37,
      sourceKey: "/resumed-after-metadata.wav",
    });
    rendered.media.state.duration = 120;
    rendered.media.state.currentTime = 0;

    act(() => rendered.media.audio.dispatchEvent(new Event("loadedmetadata")));

    expect(rendered.media.state.currentTime).toBe(37);
    expect(rendered.controller.currentTime).toBe(37);
  });

  it("retries persisted progress when the metadata-time seek is deferred", () => {
    const rendered = renderController({
      initialTime: 37,
      sourceKey: "/resume-after-data.wav",
    });
    rendered.media.state.duration = 120;
    rendered.media.state.currentTime = 0;
    rendered.media.state.ignoredCurrentTimeWrites = 1;

    act(() => rendered.media.audio.dispatchEvent(new Event("loadedmetadata")));
    expect(rendered.media.state.currentTime).toBe(0);

    act(() => rendered.media.audio.dispatchEvent(new Event("loadeddata")));
    expect(rendered.media.state.currentTime).toBe(37);
    expect(rendered.controller.currentTime).toBe(37);
  });

  it("handles the play promise, pause, and a rejected play action", async () => {
    const rendered = renderController();

    await act(async () => {
      await rendered.controller.play();
    });

    expect(rendered.media.play).toHaveBeenCalledTimes(1);
    expect(rendered.controller.isPlaying).toBe(true);
    expect(rendered.controller.error).toBeNull();

    act(() => rendered.controller.pause());

    expect(rendered.media.pause).toHaveBeenCalledTimes(1);
    expect(rendered.controller.isPlaying).toBe(false);

    rendered.media.play.mockRejectedValueOnce(new DOMException("Blocked", "NotAllowedError"));

    await act(async () => {
      await rendered.controller.play();
    });

    expect(rendered.controller.isPlaying).toBe(false);
    expect(rendered.controller.error).toMatch(/could not start/i);
    expect(rendered.controller.error).toMatch(/try again/i);
  });

  it("tracks metadata, duration changes, time updates, and seeking events", () => {
    const rendered = renderController();
    rendered.media.state.duration = 180;
    rendered.media.state.currentTime = 12.5;

    act(() => rendered.media.audio.dispatchEvent(new Event("loadedmetadata")));

    expect(rendered.controller.duration).toBe(180);
    expect(rendered.controller.currentTime).toBe(12.5);

    rendered.media.state.duration = 240;
    act(() => rendered.media.audio.dispatchEvent(new Event("durationchange")));
    expect(rendered.controller.duration).toBe(240);

    rendered.media.state.currentTime = 48;
    act(() => rendered.media.audio.dispatchEvent(new Event("timeupdate")));
    expect(rendered.controller.currentTime).toBe(48);

    rendered.media.state.currentTime = 72;
    act(() => rendered.media.audio.dispatchEvent(new Event("seeking")));
    expect(rendered.controller.currentTime).toBe(72);
    expect(rendered.controller.isSeeking).toBe(true);

    act(() => rendered.media.audio.dispatchEvent(new Event("seeked")));
    expect(rendered.controller.isSeeking).toBe(false);
  });

  it("clamps seeking and skips to the real media duration", () => {
    const rendered = renderController();
    rendered.media.state.duration = 100;
    rendered.media.state.currentTime = 5;
    act(() => rendered.media.audio.dispatchEvent(new Event("loadedmetadata")));

    act(() => rendered.controller.skip(-15));
    expect(rendered.media.state.currentTime).toBe(0);
    expect(rendered.controller.currentTime).toBe(0);

    act(() => rendered.controller.skip(150));
    expect(rendered.media.state.currentTime).toBe(100);
    expect(rendered.controller.currentTime).toBe(100);

    act(() => rendered.controller.seek(44));
    expect(rendered.media.state.currentTime).toBe(44);
    expect(rendered.controller.currentTime).toBe(44);
  });

  it("sets and observes the audio element playback rate", () => {
    const rendered = renderController();

    act(() => rendered.controller.setPlaybackRate(1.5));

    expect(rendered.media.state.playbackRate).toBe(1.5);
    expect(rendered.controller.playbackRate).toBe(1.5);

    rendered.media.state.playbackRate = 0.9;
    act(() => rendered.media.audio.dispatchEvent(new Event("ratechange")));
    expect(rendered.controller.playbackRate).toBe(0.9);
  });

  it("records ended state and surfaces actionable media errors", () => {
    const rendered = renderController();
    rendered.media.state.duration = 75;
    rendered.media.state.currentTime = 75;
    rendered.media.state.paused = false;
    act(() => rendered.media.audio.dispatchEvent(new Event("play")));

    act(() => rendered.media.audio.dispatchEvent(new Event("ended")));

    expect(rendered.controller.ended).toBe(true);
    expect(rendered.controller.isPlaying).toBe(false);
    expect(rendered.controller.currentTime).toBe(75);

    rendered.media.state.error = { code: 3 } as MediaError;
    act(() => rendered.media.audio.dispatchEvent(new Event("error")));

    expect(rendered.controller.error).toMatch(/could not be decoded/i);
    expect(rendered.controller.error).toMatch(/choose another/i);
  });

  it("pauses exactly once when a sleep deadline is reached", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T12:00:00.000Z"));
    const onSleepDeadlineReached = vi.fn();
    const deadline = Date.now() + 1_000;
    const options = { deadline, onSleepDeadlineReached };
    const rendered = renderController({
      sleepDeadline: options.deadline,
      onSleepDeadlineReached: options.onSleepDeadlineReached,
    });

    act(() => vi.advanceTimersByTime(1_000));

    expect(rendered.media.pause).toHaveBeenCalledTimes(1);
    expect(onSleepDeadlineReached).toHaveBeenCalledTimes(1);

    rendered.rerender({
      sleepDeadline: options.deadline,
      onSleepDeadlineReached: options.onSleepDeadlineReached,
    });
    act(() => vi.advanceTimersByTime(60_000));

    expect(rendered.media.pause).toHaveBeenCalledTimes(1);
    expect(onSleepDeadlineReached).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite persisted progress before an artifact is playable", () => {
    window.localStorage.setItem(
      "adaptive-audio-player.playback.book-1",
      JSON.stringify({
        bookmarks: [],
        currentChapterIndex: 0,
        isBookmarked: false,
        playbackArtifactKind: "sample-generation",
        progressSeconds: 37,
        sleepTimerMinutes: null,
        speed: 1,
        updatedAt: "2026-07-18T12:00:00.000Z",
      }),
    );
    const rendered = renderNowPlaying({
      playbackIsReady: false,
    });
    rendered.media.state.currentTime = 0;

    act(() => rendered.media.audio.dispatchEvent(new Event("durationchange")));

    const persisted = JSON.parse(
      window.localStorage.getItem("adaptive-audio-player.playback.book-1") ?? "null",
    ) as { progressSeconds: number } | null;
    expect(persisted?.progressSeconds).toBe(37);
  });

  it("restores persisted progress when the artifact becomes seekable", () => {
    window.localStorage.setItem(
      "adaptive-audio-player.playback.book-1",
      JSON.stringify({
        bookmarks: [],
        currentChapterIndex: 0,
        isBookmarked: false,
        playbackArtifactKind: "sample-generation",
        progressSeconds: 37,
        sleepTimerMinutes: null,
        speed: 1,
        updatedAt: "2026-07-18T12:00:00.000Z",
      }),
    );
    const rendered = renderNowPlaying();
    rendered.media.state.currentTime = 0;
    rendered.media.state.duration = 120;
    rendered.media.state.readyState = 4;
    rendered.media.state.seekableEnd = 120;

    act(() => rendered.media.audio.dispatchEvent(new Event("progress")));

    expect(rendered.media.state.currentTime).toBe(37);
  });

  it("does not let late progress hydration pause user-started playback", async () => {
    let resolveProgress!: (response: Response) => void;
    const progressResponse = new Promise<Response>((resolve) => {
      resolveProgress = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(() => progressResponse));
    const rendered = renderNowPlaying({ artifactId: "artifact-current" });
    rendered.media.state.duration = 120;
    rendered.media.state.readyState = 4;
    rendered.media.state.seekableEnd = 120;

    const playButton = Array.from(rendered.container.querySelectorAll("button")).find(
      (button) => button.textContent === "Play",
    );
    if (!playButton) {
      throw new Error("NowPlaying progress hydration harness did not initialize.");
    }

    await act(async () => {
      playButton.click();
      await Promise.resolve();
    });
    expect(rendered.media.state.paused).toBe(false);

    await act(async () => {
      resolveProgress(
        new Response(JSON.stringify({ progress: null }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
      await progressResponse;
      await Promise.resolve();
    });

    expect(rendered.media.pause).not.toHaveBeenCalled();
    expect(rendered.media.state.paused).toBe(false);
  });

  it("updates NowPlaying from real media events and displays play failures", async () => {
    const rendered = renderNowPlaying();
    rendered.media.state.duration = 120;
    rendered.media.state.currentTime = 42;

    act(() => rendered.media.audio.dispatchEvent(new Event("loadedmetadata")));
    act(() => rendered.media.audio.dispatchEvent(new Event("timeupdate")));

    expect(rendered.container.textContent).toContain("0:42");
    expect(rendered.container.textContent).toContain("1:18 left");
    expect(rendered.container.textContent).toContain("Narrated by Sloane");
    expect(rendered.container.textContent).not.toMatch(/\bclassic\b/i);
    expect(
      rendered.container.querySelector('[role="progressbar"]')?.getAttribute(
        "aria-valuenow",
      ),
    ).toBe("35");

    const playButton = Array.from(rendered.container.querySelectorAll("button")).find(
      (button) => button.textContent === "Play",
    );
    if (!playButton) {
      throw new Error("NowPlaying did not render its play button.");
    }

    rendered.media.play.mockRejectedValueOnce(
      new DOMException("Blocked", "NotAllowedError"),
    );
    await act(async () => {
      playButton.click();
      await Promise.resolve();
    });

    expect(rendered.media.play).toHaveBeenCalledTimes(1);
    expect(rendered.container.querySelector('[role="alert"]')?.textContent).toMatch(
      /could not start.*try again/i,
    );
  });

  it("seeks full-book playback to exact generated chapter boundaries", () => {
    const rendered = renderNowPlaying({
      audioKind: "full-book-generation",
      audioUrl: "/api/audio/generated/book-1?kind=full-book-generation",
      chapters: [
        { id: "chapter-1", order: 0, text: "First", title: "Chapter One" },
        { id: "chapter-2", order: 1, text: "Second", title: "Chapter Two" },
      ],
      chapterTimings: [
        {
          chapterIndex: 0,
          chapterTitle: "Chapter One",
          startSeconds: 0,
          durationSeconds: 41.25,
        },
        {
          chapterIndex: 1,
          chapterTitle: "Chapter Two",
          startSeconds: 41.25,
          durationSeconds: 58.75,
        },
      ],
    });
    rendered.media.state.duration = 100;
    rendered.media.state.readyState = 4;
    rendered.media.state.seekableEnd = 100;
    act(() => rendered.media.audio.dispatchEvent(new Event("loadedmetadata")));

    const chapterTwo = Array.from(
      rendered.container.querySelectorAll("button"),
    ).find((button) => button.textContent === "Chapter Two");
    if (!chapterTwo) {
      throw new Error("Chapter Two control was not rendered.");
    }
    act(() => chapterTwo.click());

    expect(rendered.media.state.currentTime).toBe(41.25);
    expect(rendered.container.textContent).toContain("2 / 2");
  });
});
