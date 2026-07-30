import {
  MAX_EXTRACTED_TEXT_CHARACTERS,
  MAX_IMPORT_CHAPTERS,
  getImportExtension,
} from "@/lib/validation/import-validation";

const supportedAudioExtensions = ["mp3", "m4b"] as const;
const supportedAudioMimeTypes = {
  mp3: new Set(["audio/mpeg", "audio/mp3", "audio/x-mp3"]),
  m4b: new Set([
    "application/mp4",
    "audio/m4b",
    "audio/mp4",
    "audio/x-m4b",
  ]),
} as const;
const supportedMp3ProbeFormats = new Set(["mp3"]);
const supportedM4bProbeFormats = new Set([
  "3g2",
  "3gp",
  "m4a",
  "mj2",
  "mov",
  "mp4",
]);
const encryptedCodecTags = new Set(["drmi", "drms", "enca", "encv"]);
const maximumTranscriptJsonBytes = 24_000_000;
const maximumWhisperSegments = 50_000;
const paragraphGapMilliseconds = 2_000;

export const MAX_AUDIO_IMPORT_BYTES = 2_000_000_000;
export const MAX_AUDIO_IMPORT_DURATION_SECONDS = 30 * 60 * 60;

export interface AudioImportFileMetadata {
  name: string;
  size: number;
  type: string;
}

export interface AudioProbeChapter {
  endMs: number;
  startMs: number;
  title: string;
}

export interface AudioProbeSummary {
  album: string | null;
  artist: string | null;
  chapters: AudioProbeChapter[];
  durationSeconds: number;
  title: string | null;
}

export interface WhisperTranscriptSegment {
  endMs: number;
  startMs: number;
  text: string;
}

export interface ProposedAudioChapter {
  endMs: number;
  id: string;
  order: number;
  startMs: number;
  text: string;
  title: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeDisplayText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return normalized || null;
}

function readTag(tags: unknown, name: string): string | null {
  if (!isRecord(tags)) {
    return null;
  }

  const match = Object.entries(tags).find(
    ([key]) => key.trim().toLowerCase() === name,
  );
  return normalizeDisplayText(match?.[1]);
}

function readFiniteNumber(value: unknown): number | null {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function getSupportedAudioExtension(filename: string) {
  const extension = getImportExtension(filename);
  return extension &&
    supportedAudioExtensions.includes(
      extension as (typeof supportedAudioExtensions)[number],
    )
    ? (extension as (typeof supportedAudioExtensions)[number])
    : null;
}

export function isSupportedAudioImportExtension(filename: string): boolean {
  return getSupportedAudioExtension(filename) !== null;
}

export function getAudioImportFileValidationError(
  file: AudioImportFileMetadata,
): string | null {
  const extension = getSupportedAudioExtension(file.name);
  if (!extension) {
    return "Choose an MP3 or M4B audiobook recording.";
  }

  const mimeType = file.type.trim().toLowerCase();
  if (mimeType && !supportedAudioMimeTypes[extension].has(mimeType)) {
    return extension === "mp3"
      ? "This file is not identified as MP3 audio. Choose another MP3 file."
      : "This file is not identified as M4B audio. Choose another M4B file.";
  }

  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    return "This audio file size could not be verified. Choose another file.";
  }

  if (file.size > MAX_AUDIO_IMPORT_BYTES) {
    return "This audiobook is larger than 2 GB. Split it into smaller recordings before importing.";
  }

  return null;
}

function parseProbeChapters(
  value: unknown,
  durationSeconds: number,
): AudioProbeChapter[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length > MAX_IMPORT_CHAPTERS) {
    throw new Error(
      "This audiobook contains too many chapter markers to import safely.",
    );
  }

  return value.map((candidate, index) => {
    if (!isRecord(candidate)) {
      throw new Error("This audiobook contains invalid chapter markers.");
    }

    const startSeconds = readFiniteNumber(candidate.start_time);
    const endSeconds = readFiniteNumber(candidate.end_time);
    if (
      startSeconds === null ||
      endSeconds === null ||
      startSeconds < 0 ||
      endSeconds <= startSeconds ||
      endSeconds > durationSeconds + 2
    ) {
      throw new Error("This audiobook contains invalid chapter markers.");
    }

    return {
      startMs: Math.round(startSeconds * 1_000),
      endMs: Math.round(endSeconds * 1_000),
      title: readTag(candidate.tags, "title") ?? `Chapter ${index + 1}`,
    };
  });
}

export function parseAudioProbe(
  value: unknown,
  filename: string,
): AudioProbeSummary {
  const extension = getSupportedAudioExtension(filename);
  if (!extension) {
    throw new Error("Choose an MP3 or M4B audiobook recording.");
  }
  if (!isRecord(value) || !isRecord(value.format)) {
    throw new Error("This audiobook could not be inspected safely.");
  }

  const formatNames =
    typeof value.format.format_name === "string"
      ? new Set(
          value.format.format_name
            .split(",")
            .map((name) => name.trim().toLowerCase())
            .filter(Boolean),
        )
      : new Set<string>();
  const allowedFormats =
    extension === "mp3" ? supportedMp3ProbeFormats : supportedM4bProbeFormats;
  if (![...formatNames].some((name) => allowedFormats.has(name))) {
    throw new Error(
      `This file does not contain supported ${extension.toUpperCase()} audio.`,
    );
  }

  const durationSeconds = readFiniteNumber(value.format.duration);
  if (durationSeconds === null || durationSeconds <= 0) {
    throw new Error("This audiobook has no readable duration.");
  }
  if (durationSeconds > MAX_AUDIO_IMPORT_DURATION_SECONDS) {
    throw new Error(
      "This audiobook is longer than 30 hours. Split it into smaller recordings before importing.",
    );
  }

  if (!Array.isArray(value.streams)) {
    throw new Error("This audiobook contains no readable audio stream.");
  }
  const audioStreams = value.streams.filter(
    (stream): stream is Record<string, unknown> =>
      isRecord(stream) &&
      typeof stream.codec_type === "string" &&
      stream.codec_type.trim().toLowerCase() === "audio",
  );
  if (audioStreams.length !== 1) {
    throw new Error(
      audioStreams.length === 0
        ? "This audiobook contains no readable audio stream."
        : "This audiobook contains multiple audio streams. Export one narration track before importing.",
    );
  }

  const codecTag = normalizeDisplayText(audioStreams[0].codec_tag_string);
  if (codecTag && encryptedCodecTags.has(codecTag.toLowerCase())) {
    throw new Error(
      "This audiobook appears to be encrypted or DRM-protected. Choose a DRM-free recording you are authorized to transform.",
    );
  }

  return {
    album: readTag(value.format.tags, "album"),
    artist: readTag(value.format.tags, "artist"),
    chapters: parseProbeChapters(value.chapters, durationSeconds),
    durationSeconds,
    title: readTag(value.format.tags, "title"),
  };
}

export function parseWhisperJsonLines(
  source: string,
  durationSeconds: number,
): WhisperTranscriptSegment[] {
  if (new TextEncoder().encode(source).byteLength > maximumTranscriptJsonBytes) {
    throw new Error("The local transcript exceeds the supported safety limit.");
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("The audiobook duration is invalid.");
  }

  const lines = source.split(/\r?\n/gu).filter((line) => line.trim());
  if (lines.length === 0) {
    throw new Error("No speech could be transcribed from this audiobook.");
  }
  if (lines.length > maximumWhisperSegments) {
    throw new Error("The local transcript contains too many speech segments.");
  }

  const durationMilliseconds = Math.ceil(durationSeconds * 1_000) + 2_000;
  const segments: WhisperTranscriptSegment[] = [];
  let previousStart = -1;
  let totalCharacters = 0;

  for (const line of lines) {
    let candidate: unknown;
    try {
      candidate = JSON.parse(line);
    } catch {
      const ffmpegLine = line.match(
        /^\{\s*"start"\s*:\s*(-?\d+)\s*,\s*"end"\s*:\s*(-?\d+)\s*,\s*"text"\s*:\s*"(.*)"\s*\}\s*$/u,
      );
      if (!ffmpegLine) {
        throw new Error("The local transcription result is malformed.");
      }
      candidate = {
        start: Number(ffmpegLine[1]),
        end: Number(ffmpegLine[2]),
        text: ffmpegLine[3],
      };
    }
    if (!isRecord(candidate)) {
      throw new Error("The local transcription result is malformed.");
    }

    const startMs = readFiniteNumber(candidate.start);
    const endMs = readFiniteNumber(candidate.end);
    const text = normalizeDisplayText(candidate.text);
    if (
      startMs === null ||
      endMs === null ||
      !Number.isSafeInteger(startMs) ||
      !Number.isSafeInteger(endMs) ||
      startMs < 0 ||
      startMs < previousStart ||
      endMs <= startMs ||
      endMs > durationMilliseconds ||
      !text
    ) {
      throw new Error("The local transcription result is malformed.");
    }

    totalCharacters += text.length;
    if (totalCharacters > MAX_EXTRACTED_TEXT_CHARACTERS) {
      throw new Error(
        "This transcript is longer than 1,000,000 characters. Split the audiobook before importing.",
      );
    }

    segments.push({ startMs, endMs, text });
    previousStart = startMs;
  }

  return segments;
}

function comparableWord(word: string) {
  return word
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}']+/gu, "");
}

function removeRepeatedBoundary(previous: string, next: string) {
  const previousWords = previous.split(/\s+/gu);
  const nextWords = next.split(/\s+/gu);
  const maximumOverlap = Math.min(12, previousWords.length, nextWords.length);

  for (let overlap = maximumOverlap; overlap > 0; overlap -= 1) {
    const previousBoundary = previousWords
      .slice(-overlap)
      .map(comparableWord)
      .join(" ");
    const nextBoundary = nextWords
      .slice(0, overlap)
      .map(comparableWord)
      .join(" ");
    if (previousBoundary && previousBoundary === nextBoundary) {
      return nextWords.slice(overlap).join(" ");
    }
  }

  return next;
}

export function mergeWhisperSegments(
  segments: readonly WhisperTranscriptSegment[],
): string {
  const paragraphs: string[] = [];
  let currentParagraph = "";
  let previousEnd = 0;

  for (const segment of segments) {
    const text = removeRepeatedBoundary(currentParagraph, segment.text);
    if (!text) {
      previousEnd = Math.max(previousEnd, segment.endMs);
      continue;
    }

    if (
      currentParagraph &&
      segment.startMs - previousEnd >= paragraphGapMilliseconds
    ) {
      paragraphs.push(currentParagraph);
      currentParagraph = text;
    } else {
      currentParagraph = currentParagraph
        ? `${currentParagraph} ${text}`
        : text;
    }
    previousEnd = Math.max(previousEnd, segment.endMs);
  }

  if (currentParagraph) {
    paragraphs.push(currentParagraph);
  }
  const transcript = paragraphs.join("\n\n").trim();
  if (!transcript) {
    throw new Error("No speech could be transcribed from this audiobook.");
  }
  if (transcript.length > MAX_EXTRACTED_TEXT_CHARACTERS) {
    throw new Error(
      "This transcript is longer than 1,000,000 characters. Split the audiobook before importing.",
    );
  }
  return transcript;
}

function titleFromFilename(filename: string) {
  return filename
    .replace(/\.[^.]+$/u, "")
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function proposeAudioChapters(
  segments: readonly WhisperTranscriptSegment[],
  probe: AudioProbeSummary,
  filename: string,
): ProposedAudioChapter[] {
  const chapterRanges =
    probe.chapters.length > 0
      ? probe.chapters
      : [
          {
            startMs: 0,
            endMs: Math.round(probe.durationSeconds * 1_000),
            title: probe.title ?? titleFromFilename(filename) ?? "Chapter 1",
          },
        ];

  return chapterRanges.map((chapter, order) => {
    const chapterSegments = segments.filter((segment) => {
      const midpoint = segment.startMs + (segment.endMs - segment.startMs) / 2;
      return midpoint >= chapter.startMs && midpoint < chapter.endMs;
    });

    return {
      ...chapter,
      id: `chapter-${order + 1}`,
      order,
      text: chapterSegments.length ? mergeWhisperSegments(chapterSegments) : "",
    };
  });
}
