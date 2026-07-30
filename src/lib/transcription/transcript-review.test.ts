import { describe, expect, it } from "vitest";

import { buildApprovedTranscriptManuscript } from "@/lib/transcription/transcript-review";

function chapter(order: number, title: string, text: string) {
  return {
    endMs: (order + 1) * 10_000,
    id: `chapter-${order + 1}`,
    order,
    startMs: order * 10_000,
    text,
    title,
  };
}

describe("approved transcript manuscript", () => {
  it("preserves reviewed text and emits headings compatible with book parsing", () => {
    expect(
      buildApprovedTranscriptManuscript([
        chapter(0, "Chapter 1", "Reviewed opening."),
        chapter(1, "The Pool of Tears", "Reviewed second chapter."),
      ]),
    ).toBe(
      "Chapter 1\nReviewed opening.\n\nChapter 2: The Pool of Tears\nReviewed second chapter.",
    );
  });

  it("does not duplicate a matching spoken chapter marker in the body", () => {
    expect(
      buildApprovedTranscriptManuscript([
        chapter(
          0,
          "01 Down the Rabbit Hole",
          "Chapter 1. Alice was beginning to get very tired.",
        ),
      ]),
    ).toBe(
      "Chapter 1: 01 Down the Rabbit Hole\nAlice was beginning to get very tired.",
    );
  });

  it.each([
    {
      chapters: [chapter(0, "", "Text")],
      message: "Add a title for chapter 1",
    },
    {
      chapters: [chapter(0, "Chapter 1", "  ")],
      message: "Review and add transcript text for chapter 1",
    },
  ])("requires complete human-reviewed chapter content", ({ chapters, message }) => {
    expect(() => buildApprovedTranscriptManuscript(chapters)).toThrow(message);
  });
});
