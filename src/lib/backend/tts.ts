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

function clampDurationMs(text: string) {
  const estimated = Math.max(1800, Math.min(9000, text.length * 35));
  return estimated;
}

function generateMockWav(text: string) {
  const durationMs = clampDurationMs(text);
  const sampleRate = 24000;
  const seconds = durationMs / 1000;
  const totalSamples = Math.floor(sampleRate * seconds);
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = totalSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  const frequency = 220 + Math.min(220, text.length % 180);
  for (let sample = 0; sample < totalSamples; sample += 1) {
    const time = sample / sampleRate;
    const envelope = Math.sin((Math.PI * sample) / totalSamples);
    const value = Math.sin(2 * Math.PI * frequency * time) * 0.18 * envelope;
    buffer.writeInt16LE(Math.floor(value * 32767), 44 + sample * bytesPerSample);
  }

  return buffer;
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

  const apiKey = process.env.OPENAI_API_KEY?.trim();
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
