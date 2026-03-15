import type { Chapter } from "@/lib/types/models";
import type { SupportedAudioImportExtension } from "@/lib/validation/import-validation";

export interface ImportedAudioChapterSegment extends Chapter {
  startSeconds: number;
  endSeconds: number | null;
}

const targetSegmentSeconds = 20 * 60;
const maxSegments = 24;

function formatDurationLabel(totalSeconds: number): string {
  const roundedSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const seconds = roundedSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }

  return `${seconds}s`;
}

function formatTimecode(totalSeconds: number): string {
  const roundedSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const seconds = roundedSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function getImportedAudioSegmentCount(durationSeconds: number | null): number {
  if (!durationSeconds || durationSeconds <= 0) {
    return 1;
  }

  return Math.max(1, Math.min(maxSegments, Math.ceil(durationSeconds / targetSegmentSeconds)));
}

export function buildImportedAudioChapterSegments(input: {
  title: string;
  fileName: string;
  format: SupportedAudioImportExtension;
  durationSeconds: number | null;
}): ImportedAudioChapterSegment[] {
  const segmentCount = getImportedAudioSegmentCount(input.durationSeconds);
  const totalSeconds =
    input.durationSeconds && input.durationSeconds > 0
      ? Math.round(input.durationSeconds)
      : null;

  if (!totalSeconds) {
    return [
      {
        id: "chapter-1",
        order: 0,
        title: "Chapter 1",
        text: `${input.title} was imported from your private ${input.format.toUpperCase()} audiobook file.\nSource file: ${input.fileName}.\nOpen the player to start listening to the original audio immediately.`,
        startSeconds: 0,
        endSeconds: null,
      },
    ];
  }

  const segmentLength = Math.ceil(totalSeconds / segmentCount);

  return Array.from({ length: segmentCount }, (_, index) => {
    const startSeconds = index * segmentLength;
    const endSeconds =
      index === segmentCount - 1 ? totalSeconds : Math.min(totalSeconds, startSeconds + segmentLength);
    const sectionNumber = index + 1;

    return {
      id: `chapter-${sectionNumber}`,
      order: index,
      title: `Chapter ${sectionNumber}`,
      text: [
        `${input.title} · Listening section ${sectionNumber} of ${segmentCount}.`,
        `Source file: ${input.fileName}.`,
        `Window: ${formatTimecode(startSeconds)} to ${formatTimecode(endSeconds)}.`,
        `Section length: ${formatDurationLabel(endSeconds - startSeconds)}.`,
        `Format: ${input.format.toUpperCase()} original audio.`,
      ].join("\n"),
      startSeconds,
      endSeconds,
    };
  });
}

export function buildImportedAudioPlaceholderText(input: {
  title: string;
  fileName: string;
  format: SupportedAudioImportExtension;
  durationSeconds: number | null;
}): string {
  return buildImportedAudioChapterSegments(input)
    .map((chapter) => `${chapter.title}\n${chapter.text}`)
    .join("\n\n");
}
