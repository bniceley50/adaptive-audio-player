import { getOpenAIApiKey } from "./env.ts";
import { generateMockWav } from "./mock-audio.ts";

function narratorToVoice(narratorId: string | null) {
  switch (narratorId) {
    case "sloane":
      return "sage";
    case "jules":
      return "coral";
    case "marlowe":
    default:
      return "ash";
  }
}

function buildInstructions(mode: string | null) {
  if (mode === "immersive") {
    return "Voice Affect: Cinematic and warm. Tone: Immersive. Pacing: Steady. Delivery: Clear long-form narration.";
  }

  if (mode === "classic") {
    return "Voice Affect: Clean and neutral. Tone: Professional. Pacing: Steady. Delivery: Plain audiobook narration.";
  }

  return "Voice Affect: Calm and warm. Tone: Conversational. Pacing: Measured. Delivery: Clear accessibility narration.";
}

export async function synthesizeAudio(input: {
  text: string;
  narratorId: string | null;
  mode: string | null;
}) {
  const trimmedText = input.text.trim();
  if (!trimmedText) {
    return {
      data: generateMockWav("Empty narration"),
      mimeType: "audio/wav",
      extension: "wav",
      provider: "mock" as const,
    };
  }

  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    return {
      data: generateMockWav(trimmedText),
      mimeType: "audio/wav",
      extension: "wav",
      provider: "mock" as const,
    };
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: narratorToVoice(input.narratorId),
      input: trimmedText.slice(0, 4000),
      format: "mp3",
      instructions: buildInstructions(input.mode),
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI TTS failed with status ${response.status}.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    data: Buffer.from(arrayBuffer),
    mimeType: "audio/mpeg",
    extension: "mp3",
    provider: "openai" as const,
  };
}
