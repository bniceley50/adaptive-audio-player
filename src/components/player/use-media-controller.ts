"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

const PLAYBACK_START_ERROR =
  "Playback could not start. Check that this audio file is available, then try again.";
const PLAYBACK_SEEK_ERROR =
  "Playback position could not be changed. Reload the audio, then try again.";
const PLAYBACK_RATE_ERROR =
  "Playback speed could not be changed. Reload the audio, then try again.";

export interface MediaControllerOptions {
  initialDuration?: number | null;
  initialPlaybackRate?: number;
  initialTime?: number;
  onSleepDeadlineReached?: () => void;
  sleepDeadline?: number | null;
  sourceKey?: string | null;
}

export interface MediaController {
  audioRef: RefObject<HTMLAudioElement | null>;
  currentTime: number;
  duration: number;
  ended: boolean;
  error: string | null;
  isPlaying: boolean;
  isSeeking: boolean;
  pause: () => void;
  play: () => Promise<void>;
  playbackRate: number;
  seek: (timeSeconds: number) => void;
  setPlaybackRate: (rate: number) => void;
  skip: (offsetSeconds: number) => void;
  togglePlayback: () => Promise<void>;
}

function normalizeTime(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(value ?? 0, 0) : 0;
}

function normalizeDuration(value: number | null | undefined): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? value ?? 0 : 0;
}

function normalizePlaybackRate(value: number | null | undefined): number {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) {
    return 1;
  }

  return Math.min(Math.max(value ?? 1, 0.25), 4);
}

function readCurrentTime(audio: HTMLAudioElement): number {
  return normalizeTime(audio.currentTime);
}

function readDuration(audio: HTMLAudioElement): number {
  return normalizeDuration(audio.duration);
}

function describeMediaError(error: MediaError | null): string {
  switch (error?.code) {
    case 1:
      return "Playback was stopped before the audio finished loading. Try again.";
    case 2:
      return "The audio could not be loaded. Check that the file is still available, then try again.";
    case 3:
      return "The audio could not be decoded. Choose another generated or imported audio file.";
    case 4:
      return "This audio format is not supported. Choose another generated or imported audio file.";
    default:
      return "The audio could not be played. Check that the file is still available, then try again.";
  }
}

export function useMediaController({
  initialDuration = null,
  initialPlaybackRate = 1,
  initialTime = 0,
  onSleepDeadlineReached,
  sleepDeadline = null,
  sourceKey = null,
}: MediaControllerOptions = {}): MediaController {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(() => normalizeTime(initialTime));
  const [duration, setDuration] = useState(() => normalizeDuration(initialDuration));
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(() =>
    normalizePlaybackRate(initialPlaybackRate),
  );
  const durationRef = useRef(duration);
  const endedRef = useRef(false);
  const handledSleepDeadlineRef = useRef<number | null>(null);
  const onSleepDeadlineReachedRef = useRef(onSleepDeadlineReached);
  const pendingInitialTimeRef = useRef<number | null>(
    normalizeTime(initialTime) > 0 ? normalizeTime(initialTime) : null,
  );
  const playRequestRef = useRef(0);

  useEffect(() => {
    onSleepDeadlineReachedRef.current = onSleepDeadlineReached;
  }, [onSleepDeadlineReached]);

  useEffect(() => {
    const nextTime = normalizeTime(initialTime);
    const nextDuration = normalizeDuration(initialDuration);
    const nextPlaybackRate = normalizePlaybackRate(initialPlaybackRate);
    const audio = audioRef.current;

    pendingInitialTimeRef.current = nextTime > 0 ? nextTime : null;
    durationRef.current = nextDuration;
    endedRef.current = false;
    playRequestRef.current += 1;
    // A source boundary is an external media reset, so the controller snapshot
    // must reset with the element instead of retaining values from the old file.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentTime(nextTime);
    setDuration(nextDuration);
    setEnded(false);
    setError(null);
    setIsPlaying(false);
    setIsSeeking(false);
    setPlaybackRateState(nextPlaybackRate);

    if (!audio) {
      return;
    }

    try {
      audio.playbackRate = nextPlaybackRate;
    } catch {
      setError(PLAYBACK_RATE_ERROR);
    }

    try {
      audio.currentTime = nextTime;
    } catch {
      if (audio.readyState >= 1) {
        setError(PLAYBACK_SEEK_ERROR);
      }
    }
  }, [initialDuration, initialPlaybackRate, initialTime, sourceKey]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    const liveAudio = audio;

    function syncCurrentTime() {
      setCurrentTime(readCurrentTime(liveAudio));
    }

    function syncDuration() {
      const nextDuration = readDuration(liveAudio);
      durationRef.current = nextDuration;
      setDuration(nextDuration);
      syncCurrentTime();
    }

    function handleLoadedMetadata() {
      const nextDuration = readDuration(liveAudio);
      const pendingInitialTime = pendingInitialTimeRef.current;
      durationRef.current = nextDuration;
      setDuration(nextDuration);

      if (pendingInitialTime === null) {
        syncCurrentTime();
        return;
      }

      const nextTime = nextDuration
        ? Math.min(pendingInitialTime, nextDuration)
        : pendingInitialTime;

      try {
        liveAudio.currentTime = nextTime;
        setCurrentTime(nextTime);
        const isAtEnd = nextDuration > 0 && nextTime >= nextDuration;
        endedRef.current = isAtEnd;
        setEnded(isAtEnd);
        setError(null);
      } catch {
        setError(PLAYBACK_SEEK_ERROR);
        syncCurrentTime();
      }
    }

    function handlePlay() {
      endedRef.current = false;
      setEnded(false);
      setError(null);
      setIsPlaying(true);
    }

    function handlePause() {
      syncCurrentTime();
      setIsPlaying(false);
    }

    function handleSeeking() {
      syncCurrentTime();
      setIsSeeking(true);
    }

    function handleSeeked() {
      syncCurrentTime();
      const pendingInitialTime = pendingInitialTimeRef.current;
      if (pendingInitialTime !== null) {
        const liveDuration = readDuration(liveAudio);
        const expectedTime = liveDuration
          ? Math.min(pendingInitialTime, liveDuration)
          : pendingInitialTime;
        if (Math.abs(readCurrentTime(liveAudio) - expectedTime) <= 0.25) {
          pendingInitialTimeRef.current = null;
        }
      }
      setIsSeeking(false);
    }

    function handleEnded() {
      syncCurrentTime();
      endedRef.current = true;
      setEnded(true);
      setIsPlaying(false);
    }

    function handleRateChange() {
      setPlaybackRateState(normalizePlaybackRate(liveAudio.playbackRate));
    }

    function handleError() {
      setError(describeMediaError(liveAudio.error));
      setIsPlaying(false);
    }

    liveAudio.addEventListener("canplay", handleLoadedMetadata);
    liveAudio.addEventListener("durationchange", syncDuration);
    liveAudio.addEventListener("ended", handleEnded);
    liveAudio.addEventListener("error", handleError);
    liveAudio.addEventListener("loadeddata", handleLoadedMetadata);
    liveAudio.addEventListener("loadedmetadata", handleLoadedMetadata);
    liveAudio.addEventListener("pause", handlePause);
    liveAudio.addEventListener("play", handlePlay);
    liveAudio.addEventListener("ratechange", handleRateChange);
    liveAudio.addEventListener("seeked", handleSeeked);
    liveAudio.addEventListener("seeking", handleSeeking);
    liveAudio.addEventListener("timeupdate", syncCurrentTime);

    if (liveAudio.readyState >= 1 && pendingInitialTimeRef.current !== null) {
      handleLoadedMetadata();
    }

    return () => {
      liveAudio.removeEventListener("canplay", handleLoadedMetadata);
      liveAudio.removeEventListener("durationchange", syncDuration);
      liveAudio.removeEventListener("ended", handleEnded);
      liveAudio.removeEventListener("error", handleError);
      liveAudio.removeEventListener("loadeddata", handleLoadedMetadata);
      liveAudio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      liveAudio.removeEventListener("pause", handlePause);
      liveAudio.removeEventListener("play", handlePlay);
      liveAudio.removeEventListener("ratechange", handleRateChange);
      liveAudio.removeEventListener("seeked", handleSeeked);
      liveAudio.removeEventListener("seeking", handleSeeking);
      liveAudio.removeEventListener("timeupdate", syncCurrentTime);
    };
  }, [sourceKey]);

  const seek = useCallback((timeSeconds: number) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const availableDuration = readDuration(audio) || durationRef.current;
    const requestedTime = normalizeTime(timeSeconds);
    const nextTime = availableDuration
      ? Math.min(requestedTime, availableDuration)
      : requestedTime;

    try {
      audio.currentTime = nextTime;
      setCurrentTime(nextTime);
      const isAtEnd = availableDuration > 0 && nextTime >= availableDuration;
      endedRef.current = isAtEnd;
      setEnded(isAtEnd);
      setError(null);
    } catch {
      setError(PLAYBACK_SEEK_ERROR);
    }
  }, []);

  const skip = useCallback(
    (offsetSeconds: number) => {
      const audio = audioRef.current;
      if (!audio || !Number.isFinite(offsetSeconds)) {
        return;
      }

      seek(readCurrentTime(audio) + offsetSeconds);
    },
    [seek],
  );

  const pause = useCallback(() => {
    playRequestRef.current += 1;
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) {
      setError(PLAYBACK_START_ERROR);
      return;
    }

    const requestId = playRequestRef.current + 1;
    playRequestRef.current = requestId;
    setError(null);

    if (endedRef.current) {
      seek(0);
    }

    try {
      await audio.play();
      if (playRequestRef.current === requestId) {
        endedRef.current = false;
        setEnded(false);
        setIsPlaying(true);
      }
    } catch {
      if (playRequestRef.current === requestId) {
        setIsPlaying(false);
        setError(PLAYBACK_START_ERROR);
      }
    }
  }, [seek]);

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) {
      setError(PLAYBACK_START_ERROR);
      return;
    }

    if (audio.paused) {
      await play();
      return;
    }

    pause();
  }, [pause, play]);

  const setPlaybackRate = useCallback((rate: number) => {
    const audio = audioRef.current;
    const nextRate = normalizePlaybackRate(rate);

    if (!audio) {
      setPlaybackRateState(nextRate);
      return;
    }

    try {
      audio.playbackRate = nextRate;
      setPlaybackRateState(nextRate);
      setError(null);
    } catch {
      setError(PLAYBACK_RATE_ERROR);
    }
  }, []);

  useEffect(() => {
    if (sleepDeadline === null) {
      handledSleepDeadlineRef.current = null;
      return;
    }

    if (handledSleepDeadlineRef.current === sleepDeadline) {
      return;
    }

    const timeout = window.setTimeout(() => {
      if (handledSleepDeadlineRef.current === sleepDeadline) {
        return;
      }

      handledSleepDeadlineRef.current = sleepDeadline;
      pause();
      onSleepDeadlineReachedRef.current?.();
    }, Math.max(sleepDeadline - Date.now(), 0));

    return () => window.clearTimeout(timeout);
  }, [pause, sleepDeadline]);

  return {
    audioRef,
    currentTime,
    duration,
    ended,
    error,
    isPlaying,
    isSeeking,
    pause,
    play,
    playbackRate,
    seek,
    setPlaybackRate,
    skip,
    togglePlayback,
  };
}
