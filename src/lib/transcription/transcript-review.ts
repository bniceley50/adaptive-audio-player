import type { AudioTranscriptChapter } from "@/lib/client/transcriptions-api";
import { MAX_EXTRACTED_TEXT_CHARACTERS } from "@/lib/validation/import-validation";

const maximumChapterTitleCharacters = 200;

function normalizedHeading(title: string, order: number) {
  const withoutExistingNumber = title
    .trim()
    .replace(/^chapter\s+\d+\s*(?:[:.\-–—]\s*)?/iu, "")
    .trim();
  return withoutExistingNumber
    ? `Chapter ${order + 1}: ${withoutExistingNumber}`
    : `Chapter ${order + 1}`;
}

function withoutRepeatedSpokenHeading(text: string, order: number) {
  const expectedChapter = order + 1;
  const repeatedHeading = new RegExp(
    `^chapter\\s+${expectedChapter}\\b\\s*(?:[:.\\-–—]\\s*)?`,
    "iu",
  );
  return text.replace(repeatedHeading, "").trim();
}

export function buildApprovedTranscriptManuscript(
  chapters: readonly AudioTranscriptChapter[],
) {
  if (chapters.length === 0) {
    throw new Error("The transcript contains no chapters to approve.");
  }

  const manuscriptParts: string[] = [];
  for (const [order, chapter] of chapters.entries()) {
    const title = chapter.title.trim();
    const text = withoutRepeatedSpokenHeading(chapter.text.trim(), order);
    if (!title) {
      throw new Error(`Add a title for chapter ${order + 1} before approving.`);
    }
    if (title.length > maximumChapterTitleCharacters) {
      throw new Error(
        `Chapter ${order + 1} has a title longer than ${maximumChapterTitleCharacters} characters.`,
      );
    }
    if (!text) {
      throw new Error(
        `Review and add transcript text for chapter ${order + 1} before approving.`,
      );
    }
    manuscriptParts.push(`${normalizedHeading(title, order)}\n${text}`);
  }

  const manuscript = manuscriptParts.join("\n\n");
  if (manuscript.length > MAX_EXTRACTED_TEXT_CHARACTERS) {
    throw new Error(
      "This reviewed transcript is longer than 1,000,000 characters. Split the audiobook before importing.",
    );
  }
  return manuscript;
}
