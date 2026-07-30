"use client";

import { useEffect, useState } from "react";

import {
  createCheckingNarrationEngineStatuses,
  NARRATION_ENGINE_CATALOG,
  resolveNarrationEngineSelection,
  type NarrationEngineId,
  type NarrationEngineStatus,
  type NarrationEngineStatusPayload,
} from "@/lib/narration/engines";

interface EngineChoiceProps {
  disabled?: boolean;
  onEngineChange: (engineId: NarrationEngineId) => void;
  selectedEngineId: NarrationEngineId;
}

function isEngineStatusPayload(value: unknown): value is NarrationEngineStatusPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<NarrationEngineStatusPayload>;
  return (
    payload.protocolVersion === 1 &&
    payload.defaultEngineId === "kokoro" &&
    Array.isArray(payload.engines) &&
    payload.engines.length === NARRATION_ENGINE_CATALOG.length &&
    payload.engines.every(
      (engine) =>
        (engine.id === "kokoro" || engine.id === "chatterbox") &&
        typeof engine.selectable === "boolean" &&
        typeof engine.statusMessage === "string",
    )
  );
}

export function EngineChoice({
  disabled = false,
  onEngineChange,
  selectedEngineId,
}: EngineChoiceProps) {
  const [statuses, setStatuses] = useState<NarrationEngineStatus[]>(
    createCheckingNarrationEngineStatuses,
  );
  const [statusError, setStatusError] = useState<string | null>(null);
  const selection = resolveNarrationEngineSelection(
    selectedEngineId,
    statuses,
  );
  const selectedEngineStatus = statuses.find(
    (status) => status.id === selectedEngineId,
  );
  const fallbackMessage = selection.message;

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/voices/engines", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok || !isEngineStatusPayload(payload)) {
          throw new Error("invalid engine status");
        }
        setStatuses(payload.engines);
        setStatusError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        setStatusError(
          "Engine status could not be checked. Fast / Compatible remains selected.",
        );
        onEngineChange("kokoro");
      });

    return () => controller.abort();
  }, [onEngineChange]);

  useEffect(() => {
    if (selectedEngineStatus?.availability === "checking") {
      return;
    }

    if (selection.selectedEngineId !== selectedEngineId) {
      onEngineChange(selection.selectedEngineId);
    }
  }, [
    onEngineChange,
    selectedEngineId,
    selectedEngineStatus?.availability,
    selection.selectedEngineId,
  ]);

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-lg font-semibold text-stone-950">
        Choose listening quality
      </legend>
      <p className="text-sm leading-6 text-stone-600">
        Both options stay local. High Quality is optional and never downloads itself.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {NARRATION_ENGINE_CATALOG.map((engine) => {
          const status = statuses.find((item) => item.id === engine.id);
          const inputId = `engine-choice-${engine.id}`;
          const descriptionId = `${inputId}-description`;
          const isSelected = selectedEngineId === engine.id;
          const selectable = status?.selectable === true;

          return (
            <label
              className={`rounded-[1.35rem] border p-4 transition ${
                isSelected
                  ? "border-[#274c5b] bg-[#eef7f5] shadow-sm"
                  : "border-stone-200 bg-white"
              } ${selectable ? "cursor-pointer hover:border-stone-300" : "cursor-not-allowed opacity-75"}`}
              htmlFor={inputId}
              key={engine.id}
            >
              <span className="flex gap-3">
                <input
                  aria-describedby={descriptionId}
                  checked={isSelected}
                  className="mt-1 h-4 w-4 accent-[#274c5b]"
                  disabled={!selectable}
                  id={inputId}
                  name="narration-engine"
                  type="radio"
                  value={engine.id}
                  onChange={() => onEngineChange(engine.id)}
                />
                <span>
                  <span className="block font-semibold text-stone-950">
                    {engine.label}
                  </span>
                  <span className="mt-1 block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                    {engine.engineName}
                  </span>
                </span>
              </span>
              <span
                className="mt-3 block text-sm leading-6 text-stone-600"
                id={descriptionId}
              >
                {engine.description} {status?.statusMessage}
              </span>
              {engine.id === "chatterbox" ? (
                <span className="mt-2 block text-xs leading-5 text-stone-500">
                  Uses a bundled synthetic voice only; reference-audio voice cloning is disabled.
                </span>
              ) : null}
            </label>
          );
        })}
      </div>

      {statusError || fallbackMessage ? (
        <p
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          {statusError ?? fallbackMessage}
        </p>
      ) : null}
    </fieldset>
  );
}
