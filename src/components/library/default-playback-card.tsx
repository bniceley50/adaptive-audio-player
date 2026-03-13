"use client";

import { useEffect, useState } from "react";
import { workspaceContextChangedEvent } from "@/lib/library/local-state";
import {
  clearPlaybackDefaults,
  playbackDefaultsChangedEvent,
  readPlaybackDefaults,
  type PlaybackDefaults,
} from "@/lib/playback/local-playback";

interface DefaultPlaybackCardProps {
  initialDefaults?: PlaybackDefaults | null;
}

export function DefaultPlaybackCard({
  initialDefaults = null,
}: DefaultPlaybackCardProps) {
  const [localDefaults, setLocalDefaults] = useState<
    PlaybackDefaults | null | undefined
  >(undefined);

  useEffect(() => {
    function handleDefaultsChanged() {
      setLocalDefaults(readPlaybackDefaults());
    }

    function handleWorkspaceContextChanged() {
      setLocalDefaults(undefined);
    }

    window.addEventListener(playbackDefaultsChangedEvent, handleDefaultsChanged);
    window.addEventListener(
      workspaceContextChangedEvent,
      handleWorkspaceContextChanged,
    );
    return () => {
      window.removeEventListener(playbackDefaultsChangedEvent, handleDefaultsChanged);
      window.removeEventListener(
        workspaceContextChangedEvent,
        handleWorkspaceContextChanged,
      );
    };
  }, []);

  const defaults =
    localDefaults !== undefined ? localDefaults : initialDefaults ?? readPlaybackDefaults();

  return (
    <section className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-stone-900">Playback defaults</h2>
      {defaults ? (
        <>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            New player sessions start from {defaults.speed.toFixed(2).replace(/\.00$/, "")}x
            {" with "}
            {defaults.sleepTimerMinutes
              ? `${defaults.sleepTimerMinutes} minute sleep timer`
              : "sleep timer off"}
            .
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
            <span className="rounded-full bg-stone-100 px-3 py-2">
              Speed: {defaults.speed.toFixed(2).replace(/\.00$/, "")}x
            </span>
            <span className="rounded-full bg-stone-100 px-3 py-2">
              Timer: {defaults.sleepTimerMinutes ? `${defaults.sleepTimerMinutes} min` : "off"}
            </span>
          </div>
          <button
            className="mt-5 rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700"
            type="button"
            onClick={clearPlaybackDefaults}
          >
            Clear playback defaults
          </button>
        </>
      ) : (
        <p className="mt-2 text-sm leading-6 text-stone-600">
          No playback defaults saved yet.
        </p>
      )}
    </section>
  );
}
