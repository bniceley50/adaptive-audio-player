import type { Chapter } from "@/lib/types/models";

export function parseChapters(text: string): Chapter[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const rawParts = normalized.split(/\n(?=chapter\s+\d+\b)/i).filter(Boolean);

  if (rawParts.length === 1) {
    return [
      {
        id: "chapter-1",
        title: "Chapter 1",
        text: normalized,
        order: 0,
      },
    ];
  }

  return rawParts.map((part, index) => {
    const [firstLine, ...rest] = part.split("\n");

    return {
      id: `chapter-${index + 1}`,
      title: firstLine.trim() || `Chapter ${index + 1}`,
      text: rest.join("\n").trim(),
      order: index,
    };
  });
}
