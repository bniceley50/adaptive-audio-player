import { describe, expect, it } from "vitest";

import { removeLegacySavedQuoteKeys } from "@/lib/library/local-quotes";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  has(key: string) {
    return this.values.has(key);
  }
}

describe("removeLegacySavedQuoteKeys", () => {
  it("removes every retired quote entry without touching other browser state", () => {
    const storage = new MemoryStorage();
    storage.setItem("adaptive-audio-player.saved-quotes.book-1", "private excerpt");
    storage.setItem("adaptive-audio-player.saved-quotes.book-2", "another excerpt");
    storage.setItem("adaptive-audio-player.library.books", "[]");

    expect(removeLegacySavedQuoteKeys(storage)).toBe(2);
    expect(storage.has("adaptive-audio-player.saved-quotes.book-1")).toBe(false);
    expect(storage.has("adaptive-audio-player.saved-quotes.book-2")).toBe(false);
    expect(storage.has("adaptive-audio-player.library.books")).toBe(true);
  });
});
