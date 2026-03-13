import { readLocalLibraryBook } from "@/lib/library/local-library";

export interface SavedQuote {
  id: string;
  bookId: string;
  chapterIndex: number;
  progressSeconds: number;
  text: string;
  createdAt: string;
}

export const savedQuotesChangedEvent = "adaptive-audio-player.saved-quotes-changed";

function getSavedQuotesStorageKey(bookId: string): string {
  return `adaptive-audio-player.saved-quotes.${bookId}`;
}

export function readSavedQuotes(bookId: string): SavedQuote[] {
  if (typeof window === "undefined") {
    return [];
  }

  const rawValue = window.localStorage.getItem(getSavedQuotesStorageKey(bookId));
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as SavedQuote[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (quote) =>
        typeof quote.id === "string" &&
        typeof quote.bookId === "string" &&
        typeof quote.chapterIndex === "number" &&
        typeof quote.progressSeconds === "number" &&
        typeof quote.text === "string" &&
        typeof quote.createdAt === "string",
    );
  } catch {
    return [];
  }
}

export function writeSavedQuotes(bookId: string, quotes: SavedQuote[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    getSavedQuotesStorageKey(bookId),
    JSON.stringify(quotes),
  );
  window.dispatchEvent(new Event(savedQuotesChangedEvent));
}

export function readAllSavedQuotes(): Array<
  SavedQuote & {
    bookTitle: string | null;
    coverTheme: string | null;
    coverLabel: string | null;
    coverGlyph: string | null;
    genreLabel: string | null;
  }
> {
  if (typeof window === "undefined") {
    return [];
  }

  const results: Array<
    SavedQuote & {
      bookTitle: string | null;
      coverTheme: string | null;
      coverLabel: string | null;
      coverGlyph: string | null;
      genreLabel: string | null;
    }
  > = [];

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith("adaptive-audio-player.saved-quotes.")) {
      continue;
    }

    const bookId = key.replace("adaptive-audio-player.saved-quotes.", "");
    const quotes = readSavedQuotes(bookId);
    const book = readLocalLibraryBook(bookId);

    for (const quote of quotes) {
      results.push({
        ...quote,
        bookTitle: book?.title ?? null,
        coverTheme: book?.coverTheme ?? null,
        coverLabel: book?.coverLabel ?? null,
        coverGlyph: book?.coverGlyph ?? null,
        genreLabel: book?.genreLabel ?? null,
      });
    }
  }

  return results.sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}
