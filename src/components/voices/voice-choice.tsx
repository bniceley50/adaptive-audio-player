"use client";

import { useEffect, useRef, useState } from "react";

import {
  getVoicesForNarrationEngine,
  type VoiceId,
} from "@/lib/voices/catalog";
import type { NarrationEngineId } from "@/lib/narration/engines";

interface VoiceChoiceProps {
  disabled?: boolean;
  narrationEngineId?: NarrationEngineId;
  onVoiceChange: (voiceId: VoiceId) => void;
  selectedVoiceId: VoiceId | null;
}

export function VoiceChoice({
  disabled = false,
  narrationEngineId = "kokoro",
  onVoiceChange,
  selectedVoiceId,
}: VoiceChoiceProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [previewVoiceId, setPreviewVoiceId] = useState<VoiceId | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const voices = getVoicesForNarrationEngine(narrationEngineId);

  useEffect(() => {
    const audio = audioRef.current;

    return () => {
      audio?.pause();
    };
  }, []);

  async function togglePreview(voiceId: VoiceId) {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    setPreviewError(null);

    if (previewVoiceId === voiceId) {
      audio.pause();
      audio.currentTime = 0;
      setPreviewVoiceId(null);
      return;
    }

    audio.pause();
    audio.src = `/api/voices/${encodeURIComponent(voiceId)}/preview?engine=${encodeURIComponent(narrationEngineId)}`;
    audio.load();
    setPreviewVoiceId(voiceId);

    try {
      await audio.play();
    } catch {
      setPreviewVoiceId(null);
      setPreviewError(
        "This voice preview is unavailable right now. Start local narration and try again.",
      );
    }
  }

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-lg font-semibold text-stone-950">
        Choose a voice
      </legend>
      <p className="text-sm leading-6 text-stone-600">
        {narrationEngineId === "chatterbox"
          ? "High Quality uses one verified synthetic narrator and never accepts reference audio."
          : "Select one voice for this book. You can hear every option before generating anything."}
      </p>

      <div className="grid gap-3">
        {voices.map((voice) => {
          const inputId = `voice-choice-${voice.id}`;
          const descriptionId = `${inputId}-description`;
          const isSelected = selectedVoiceId === voice.id;
          const isPlaying = previewVoiceId === voice.id;

          return (
            <div
              key={voice.id}
              className={`rounded-[1.35rem] border p-4 transition ${
                isSelected
                  ? "border-[#274c5b] bg-[#eef7f5] shadow-sm"
                  : "border-stone-200 bg-white hover:border-stone-300"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 flex-1 gap-3">
                  <input
                    aria-describedby={descriptionId}
                    checked={isSelected}
                    className="mt-1 h-4 w-4 accent-[#274c5b]"
                    id={inputId}
                    name="voice"
                    type="radio"
                    value={voice.id}
                    onChange={() => onVoiceChange(voice.id)}
                  />
                  <span>
                    <label
                      className="block cursor-pointer font-semibold text-stone-950"
                      htmlFor={inputId}
                    >
                      {voice.displayName}
                    </label>
                    <span
                      className="mt-1 block text-sm leading-6 text-stone-600"
                      id={descriptionId}
                    >
                      {voice.description}
                    </span>
                  </span>
                </div>
                <button
                  aria-label={`${isPlaying ? "Stop" : "Play"} ${voice.displayName} preview`}
                  className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={() => void togglePreview(voice.id)}
                >
                  {isPlaying ? "Stop preview" : "Play preview"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {previewError ? (
        <p
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          role="alert"
        >
          {previewError}
        </p>
      ) : null}

      <audio
        ref={audioRef}
        hidden
        preload="none"
        onEnded={() => setPreviewVoiceId(null)}
      />
    </fieldset>
  );
}
