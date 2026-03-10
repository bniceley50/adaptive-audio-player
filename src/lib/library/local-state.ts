"use client";

const localKeyPrefix = "adaptive-audio-player.";
export const workspaceContextChangedEvent =
  "adaptive-audio-player.workspace-context-changed";

export function clearAdaptiveAudioPlayerLocalState() {
  if (typeof window === "undefined") {
    return;
  }

  const keysToRemove: string[] = [];

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(localKeyPrefix)) {
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    window.localStorage.removeItem(key);
  }

  window.dispatchEvent(new Event("storage"));
}

export function notifyWorkspaceContextChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(workspaceContextChangedEvent));
}
