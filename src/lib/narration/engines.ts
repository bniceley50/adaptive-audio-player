export const FAST_NARRATION_ENGINE_ID = "kokoro" as const;
export const HIGH_QUALITY_NARRATION_ENGINE_ID = "chatterbox" as const;

export const NARRATION_ENGINE_CATALOG = [
  {
    id: FAST_NARRATION_ENGINE_ID,
    label: "Fast / Compatible",
    engineName: "Kokoro",
    description:
      "Reliable local narration for modest machines, with the quickest generation.",
  },
  {
    id: HIGH_QUALITY_NARRATION_ENGINE_ID,
    label: "High Quality",
    engineName: "Chatterbox",
    description:
      "More natural local narration for capable NVIDIA GPUs. Optional setup is required.",
  },
] as const;

export type NarrationEngineId = (typeof NARRATION_ENGINE_CATALOG)[number]["id"];
export type NarrationEngineAvailability =
  | "checking"
  | "ready"
  | "not-installed"
  | "unavailable"
  | "unsupported";

export interface NarrationEngineStatus {
  id: NarrationEngineId;
  availability: NarrationEngineAvailability;
  selectable: boolean;
  statusMessage: string;
}

export interface NarrationEngineStatusPayload {
  protocolVersion: 1;
  defaultEngineId: typeof FAST_NARRATION_ENGINE_ID;
  engines: NarrationEngineStatus[];
}

export function getNarrationEngineDefinition(value: unknown) {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  return (
    NARRATION_ENGINE_CATALOG.find((engine) => engine.id === normalized) ?? null
  );
}

export function resolveNarrationEngineSelection(
  requestedEngineId: unknown,
  statuses: readonly NarrationEngineStatus[],
) {
  const requestedEngine = getNarrationEngineDefinition(requestedEngineId);
  const requestedStatus = requestedEngine
    ? statuses.find((status) => status.id === requestedEngine.id)
    : null;

  if (requestedStatus?.selectable) {
    return {
      didFallback: false,
      selectedEngineId: requestedStatus.id,
      message: null,
    } as const;
  }

  const fallbackStatus = statuses.find(
    (status) =>
      status.id === FAST_NARRATION_ENGINE_ID && status.selectable,
  );

  return {
    didFallback: requestedEngine?.id !== FAST_NARRATION_ENGINE_ID,
    selectedEngineId: fallbackStatus?.id ?? FAST_NARRATION_ENGINE_ID,
    message:
      requestedEngine?.id === HIGH_QUALITY_NARRATION_ENGINE_ID
        ? `${requestedStatus?.statusMessage ?? "High Quality is unavailable."} Fast / Compatible remains selected.`
        : null,
  } as const;
}

export function createCheckingNarrationEngineStatuses(): NarrationEngineStatus[] {
  return [
    {
      id: FAST_NARRATION_ENGINE_ID,
      availability: "ready",
      selectable: true,
      statusMessage: "Ready and selected by default.",
    },
    {
      id: HIGH_QUALITY_NARRATION_ENGINE_ID,
      availability: "checking",
      selectable: false,
      statusMessage: "Checking this machine and local installation…",
    },
  ];
}
