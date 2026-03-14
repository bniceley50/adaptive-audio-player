function clampDurationMs(text: string) {
  const estimated = Math.max(1800, Math.min(9000, text.length * 35));
  return estimated;
}

export function generateMockWav(text: string) {
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
