import type { NarrationEngineId } from "@/lib/narration/engines";

export const VOICE_PREVIEW_TEXT =
  "Every story has a rhythm; let this voice guide you into the next chapter.";

export const VOICE_CATALOG = Object.freeze([
  Object.freeze({
    id: "marlowe",
    displayName: "Marlowe",
    description: "Warm and cinematic for fiction-first listening.",
    engineVoiceId: "af_heart",
    narrationEngineId: "kokoro",
  }),
  Object.freeze({
    id: "sloane",
    displayName: "Sloane",
    description: "Calm and steady for long listening sessions.",
    engineVoiceId: "af_bella",
    narrationEngineId: "kokoro",
  }),
  Object.freeze({
    id: "jules",
    displayName: "Jules",
    description: "Conversational and bright for fast pacing.",
    engineVoiceId: "am_michael",
    narrationEngineId: "kokoro",
  }),
  Object.freeze({
    id: "chatterbox-default",
    displayName: "High Quality Narrator",
    description:
      "The verified synthetic narrator bundled with the optional High Quality engine.",
    engineVoiceId: "chatterbox-default",
    narrationEngineId: "chatterbox",
  }),
] as const);

export type VoiceCatalogEntry = (typeof VOICE_CATALOG)[number];
export type VoiceId = VoiceCatalogEntry["id"];

export const VOICE_DISPLAY_NAMES = Object.freeze(
  Object.fromEntries(
    VOICE_CATALOG.map((voice) => [voice.id, voice.displayName]),
  ),
) as Readonly<Record<VoiceId, string>>;

export function getVoiceCatalogEntry(value: unknown): VoiceCatalogEntry | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedId = value.trim().toLowerCase();
  return VOICE_CATALOG.find((voice) => voice.id === normalizedId) ?? null;
}

export function getVoicesForNarrationEngine(
  engineId: NarrationEngineId,
): readonly VoiceCatalogEntry[] {
  return VOICE_CATALOG.filter(
    (voice) => voice.narrationEngineId === engineId,
  );
}

export function voiceSupportsNarrationEngine(
  voiceId: unknown,
  engineId: NarrationEngineId,
): boolean {
  return getVoiceCatalogEntry(voiceId)?.narrationEngineId === engineId;
}
