import { describe, expect, it } from "vitest";

import {
  MAX_AUDIO_IMPORT_BYTES,
  getAudioImportFileValidationError,
  isSupportedAudioImportExtension,
  mergeWhisperSegments,
  parseAudioProbe,
  parseWhisperJsonLines,
  proposeAudioChapters,
} from "./audio-import";

describe("audio re-narration import validation", () => {
  it("accepts bounded MP3 and M4B metadata case-insensitively", () => {
    expect(isSupportedAudioImportExtension("Story.MP3")).toBe(true);
    expect(isSupportedAudioImportExtension("Story.M4B")).toBe(true);
    expect(
      getAudioImportFileValidationError({
        name: "Story.MP3",
        size: 12_744_133,
        type: " AUDIO/MPEG ",
      }),
    ).toBeNull();
    expect(
      getAudioImportFileValidationError({
        name: "Story.m4b",
        size: 147_000_000,
        type: "audio/mp4",
      }),
    ).toBeNull();
  });

  it("rejects unsupported, mislabeled, empty, and oversized audio files", () => {
    expect(
      getAudioImportFileValidationError({
        name: "story.aax",
        size: 10,
        type: "audio/aax",
      }),
    ).toBe("Choose an MP3 or M4B audiobook recording.");
    expect(
      getAudioImportFileValidationError({
        name: "story.mp3",
        size: 10,
        type: "video/mp4",
      }),
    ).toContain("not identified as MP3 audio");
    expect(
      getAudioImportFileValidationError({
        name: "story.m4b",
        size: 0,
        type: "audio/mp4",
      }),
    ).toContain("size could not be verified");
    expect(
      getAudioImportFileValidationError({
        name: "story.m4b",
        size: MAX_AUDIO_IMPORT_BYTES + 1,
        type: "audio/mp4",
      }),
    ).toContain("larger than 2 GB");
  });
});

describe("audio probe validation", () => {
  const validProbe = {
    format: {
      duration: "796.492313",
      format_name: "mp3",
      tags: {
        album: "Alice's Adventures in Wonderland",
        artist: "Lewis Carroll",
        title: "01 Down the Rabbit Hole",
      },
    },
    streams: [
      {
        codec_name: "mp3",
        codec_tag_string: "[0][0][0][0]",
        codec_type: "audio",
      },
    ],
  };

  it("returns bounded display metadata for a real MP3-shaped probe", () => {
    expect(parseAudioProbe(validProbe, "alice.mp3")).toEqual({
      album: "Alice's Adventures in Wonderland",
      artist: "Lewis Carroll",
      chapters: [],
      durationSeconds: 796.492313,
      title: "01 Down the Rabbit Hole",
    });
  });

  it("accepts M4B container aliases and normalizes embedded chapters", () => {
    expect(
      parseAudioProbe(
        {
          format: { duration: 120, format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
          streams: [{ codec_tag_string: "mp4a", codec_type: "audio" }],
          chapters: [
            {
              start_time: "0",
              end_time: "60",
              tags: { TITLE: "Opening" },
            },
            { start_time: "60", end_time: "120", tags: {} },
          ],
        },
        "book.m4b",
      ).chapters,
    ).toEqual([
      { startMs: 0, endMs: 60_000, title: "Opening" },
      { startMs: 60_000, endMs: 120_000, title: "Chapter 2" },
    ]);
  });

  it.each([
    {
      name: "wrong container",
      probe: { ...validProbe, format: { duration: 60, format_name: "wav" } },
      message: "does not contain supported MP3 audio",
    },
    {
      name: "missing audio",
      probe: { ...validProbe, streams: [] },
      message: "no readable audio stream",
    },
    {
      name: "multiple tracks",
      probe: {
        ...validProbe,
        streams: [{ codec_type: "audio" }, { codec_type: "audio" }],
      },
      message: "multiple audio streams",
    },
    {
      name: "DRM marker",
      probe: {
        ...validProbe,
        streams: [{ codec_type: "audio", codec_tag_string: "enca" }],
      },
      message: "encrypted or DRM-protected",
    },
    {
      name: "excessive duration",
      probe: {
        ...validProbe,
        format: { duration: 30 * 60 * 60 + 1, format_name: "mp3" },
      },
      message: "longer than 30 hours",
    },
  ])("rejects $name", ({ message, probe }) => {
    expect(() => parseAudioProbe(probe, "book.mp3")).toThrow(message);
  });
});

describe("Whisper transcript normalization", () => {
  it("parses line-delimited FFmpeg Whisper JSON and removes repeated overlap", () => {
    const segments = parseWhisperJsonLines(
      [
        JSON.stringify({ start: 0, end: 4_000, text: "Chapter 1." }),
        JSON.stringify({
          start: 3_900,
          end: 8_000,
          text: "Chapter 1. Alice was beginning to get tired.",
        }),
        JSON.stringify({
          start: 10_500,
          end: 14_000,
          text: "The White Rabbit ran close by her.",
        }),
      ].join("\n"),
      14,
    );

    expect(segments).toHaveLength(3);
    expect(mergeWhisperSegments(segments)).toBe(
      "Chapter 1. Alice was beginning to get tired.\n\nThe White Rabbit ran close by her.",
    );
  });

  it("accepts FFmpeg Whisper dialogue lines with unescaped quotation marks", () => {
    const segments = parseWhisperJsonLines(
      '{"start":65216,"end":71896,"text":"the rabbit said, "Oh, dear, I shall be late!""}',
      80,
    );

    expect(segments).toEqual([
      {
        startMs: 65_216,
        endMs: 71_896,
        text: 'the rabbit said, "Oh, dear, I shall be late!"',
      },
    ]);
  });

  it.each([
    "not-json",
    JSON.stringify({ start: 500, end: 100, text: "backward" }),
    JSON.stringify({ start: 0, end: 1_000, text: "" }),
  ])("rejects malformed transcript output", (source) => {
    expect(() => parseWhisperJsonLines(source, 10)).toThrow(
      /malformed|No speech/,
    );
  });

  it("uses embedded M4B ranges for chapter proposals and falls back for MP3", () => {
    const segments = [
      { startMs: 0, endMs: 3_000, text: "Opening words." },
      { startMs: 61_000, endMs: 64_000, text: "Second chapter." },
    ];
    const baseProbe = {
      album: null,
      artist: null,
      durationSeconds: 120,
      title: "Recorded Book",
    };

    expect(
      proposeAudioChapters(
        segments,
        {
          ...baseProbe,
          chapters: [
            { startMs: 0, endMs: 60_000, title: "Opening" },
            { startMs: 60_000, endMs: 120_000, title: "Chapter Two" },
          ],
        },
        "book.m4b",
      ),
    ).toEqual([
      {
        id: "chapter-1",
        order: 0,
        startMs: 0,
        endMs: 60_000,
        text: "Opening words.",
        title: "Opening",
      },
      {
        id: "chapter-2",
        order: 1,
        startMs: 60_000,
        endMs: 120_000,
        text: "Second chapter.",
        title: "Chapter Two",
      },
    ]);
    expect(
      proposeAudioChapters(
        segments,
        { ...baseProbe, chapters: [] },
        "book.mp3",
      )[0],
    ).toMatchObject({ title: "Recorded Book", text: expect.stringContaining("Second chapter") });
  });
});
