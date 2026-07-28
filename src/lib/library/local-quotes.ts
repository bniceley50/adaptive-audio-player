const legacySavedQuoteStoragePrefix = "adaptive-audio-player.saved-quotes.";

interface LegacyQuoteStorage {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

export function removeLegacySavedQuoteKeys(storage: LegacyQuoteStorage): number {
  const keysToRemove: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(legacySavedQuoteStoragePrefix)) {
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    storage.removeItem(key);
  }

  return keysToRemove.length;
}

export function clearLegacySavedQuotes(): number {
  if (typeof window === "undefined") {
    return 0;
  }

  return removeLegacySavedQuoteKeys(window.localStorage);
}
