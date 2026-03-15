import { describe, expect, it } from "vitest";

import {
  buildImportedAudioChapterSegments,
  buildImportedAudioPlaceholderText,
  getImportedAudioSegmentCount,
} from "@/lib/import/imported-audio-chapters";

describe("imported audio chapters", () => {
  it("falls back to a single chapter when duration is missing", () => {
    const chapters = buildImportedAudioChapterSegments({
      title: "Storm Harbor",
      fileName: "storm-harbor.m4b",
      format: "m4b",
      durationSeconds: null,
    });

    expect(chapters).toHaveLength(1);
    expect(chapters[0]?.title).toBe("Chapter 1");
    expect(chapters[0]?.startSeconds).toBe(0);
    expect(chapters[0]?.endSeconds).toBeNull();
  });

  it("splits longer audiobooks into listening sections", () => {
    const chapters = buildImportedAudioChapterSegments({
      title: "Storm Harbor",
      fileName: "storm-harbor.mp3",
      format: "mp3",
      durationSeconds: 3900,
    });

    expect(getImportedAudioSegmentCount(3900)).toBe(4);
    expect(chapters).toHaveLength(4);
    expect(chapters[0]?.startSeconds).toBe(0);
    expect(chapters[1]?.startSeconds).toBeGreaterThan(0);
    expect(chapters.at(-1)?.endSeconds).toBe(3900);
  });

  it("builds placeholder text that parse-chapters can split", () => {
    const placeholder = buildImportedAudioPlaceholderText({
      title: "Storm Harbor",
      fileName: "storm-harbor.mp3",
      format: "mp3",
      durationSeconds: 3900,
    });

    expect(placeholder).toContain("Chapter 1");
    expect(placeholder).toContain("Chapter 2");
    expect(placeholder).toContain("Window:");
  });
});
