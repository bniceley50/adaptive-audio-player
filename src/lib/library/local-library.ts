import {
  clearPersistedPlaybackState,
  readPersistedPlaybackState,
  writePersistedPlaybackState,
  type PersistedPlaybackState,
} from "@/lib/playback/local-playback";

export interface LocalLibraryBook {
  bookId: string;
  title: string;
  chapterCount: number;
  updatedAt: string;
  sourceType?: "text" | "audio";
  importedAudioFormat?: "mp3" | "m4b" | null;
  importedAudioDurationSeconds?: number | null;
  importedAudioFileName?: string | null;
  coverTheme?: string;
  coverLabel?: string;
  coverGlyph?: string;
  genreLabel?: string;
}

const libraryStorageKey = "adaptive-audio-player.library.books";
const listeningProfileStorageKey = "adaptive-audio-player.library.profiles";
const defaultListeningProfileStorageKey =
  "adaptive-audio-player.library.default-profile";
const sampleRequestStorageKey = "adaptive-audio-player.sample-request";
const generationOutputsStorageKey = "adaptive-audio-player.library.generated-outputs";
const removedBooksStorageKey = "adaptive-audio-player.library.removed-books";
export const defaultTasteChangedEvent =
  "adaptive-audio-player.default-taste-changed";
export const libraryChangedEvent = "adaptive-audio-player.library-changed";
export const listeningProfileChangedEvent =
  "adaptive-audio-player.listening-profile-changed";
export const sampleRequestChangedEvent =
  "adaptive-audio-player.sample-request-changed";
export const generationOutputChangedEvent =
  "adaptive-audio-player.generation-output-changed";
export const removedBooksChangedEvent =
  "adaptive-audio-player.removed-books-changed";

export interface LocalListeningProfile {
  bookId: string;
  narratorId: string;
  narratorName: string;
  mode: string;
}

export interface LocalSampleRequest {
  bookId: string;
  narratorId: string;
  mode: string;
}

export interface LocalGenerationOutput {
  workspaceId: string;
  bookId: string;
  kind: "sample-generation" | "full-book-generation";
  narratorId: string | null;
  mode: string | null;
  chapterCount: number | null;
  assetPath: string;
  mimeType: string;
  provider: "openai" | "mock";
  generatedAt: string;
}

export interface RemovedLocalLibraryBook {
  book: LocalLibraryBook;
  draftText: string;
  profile: LocalListeningProfile | null;
  sampleRequest: LocalSampleRequest | null;
  playbackState: PersistedPlaybackState | null;
  generationOutputs: LocalGenerationOutput[];
  removedAt: string;
}

export type ListeningTasteSource =
  | "saved"
  | "default"
  | "recent"
  | "none";

export interface ResolvedListeningTaste {
  profile: LocalListeningProfile | null;
  source: ListeningTasteSource;
}

export interface ListeningTasteSourceMeta {
  badge: string;
  summary: string;
  detail: string;
  actionHint: string;
}

export function readLocalLibraryBooks(): LocalLibraryBook[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(libraryStorageKey);
  if (!raw) {
    return [];
  }

  try {
    return (
      JSON.parse(raw) as Array<
        Omit<LocalLibraryBook, "updatedAt"> &
          Partial<Pick<LocalLibraryBook, "updatedAt">>
      >
    ).map((book, index) => ({
      ...book,
      updatedAt: book.updatedAt ?? new Date(Date.now() - index).toISOString(),
    }));
  } catch {
    return [];
  }
}

export function readLocalLibraryBookTitle(bookId: string): string | null {
  const match = readLocalLibraryBooks().find((book) => book.bookId === bookId);
  return match?.title ?? null;
}

export function readLocalLibraryBook(bookId: string): LocalLibraryBook | null {
  return readLocalLibraryBooks().find((book) => book.bookId === bookId) ?? null;
}

export function formatRelativeUpdatedAt(updatedAt: string): string {
  const diffMs = Date.now() - new Date(updatedAt).getTime();
  const diffMinutes = Math.max(Math.floor(diffMs / 60000), 0);

  if (diffMinutes < 1) {
    return "Updated just now";
  }

  if (diffMinutes < 60) {
    return `Updated ${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Updated ${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `Updated ${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

export function getLocalDraftStorageKey(bookId: string): string {
  return `adaptive-audio-player.library.draft.${bookId}`;
}

export function readLocalDraftText(bookId: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(getLocalDraftStorageKey(bookId)) ?? "";
}

export function writeLocalDraftText(bookId: string, text: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getLocalDraftStorageKey(bookId), text);
}

export function clearLocalDraftText(bookId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(getLocalDraftStorageKey(bookId));
}

export function readRemovedLocalLibraryBooks(): RemovedLocalLibraryBook[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(removedBooksStorageKey);
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as RemovedLocalLibraryBook[];
  } catch {
    return [];
  }
}

export function readRemovedLocalLibraryBook(
  bookId: string,
): RemovedLocalLibraryBook | null {
  return (
    readRemovedLocalLibraryBooks().find(
      (removedBook) => removedBook.book.bookId === bookId,
    ) ?? null
  );
}

function writeRemovedLocalLibraryBooks(removedBooks: RemovedLocalLibraryBook[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(removedBooksStorageKey, JSON.stringify(removedBooks));
  window.dispatchEvent(new Event(removedBooksChangedEvent));
}

export function replaceRemovedLocalLibraryBooks(
  removedBooks: RemovedLocalLibraryBook[],
): void {
  if (typeof window === "undefined") {
    return;
  }

  const removedBookIds = new Set(removedBooks.map((removedBook) => removedBook.book.bookId));

  if (removedBookIds.size > 0) {
    const nextBooks = readLocalLibraryBooks().filter(
      (book) => !removedBookIds.has(book.bookId),
    );
    window.localStorage.setItem(libraryStorageKey, JSON.stringify(nextBooks));

    for (const bookId of removedBookIds) {
      clearLocalDraftText(bookId);
      removeLocalListeningProfile(bookId);
      clearLocalSampleRequest(bookId);
      clearPersistedPlaybackState(bookId);
      clearLocalGenerationOutputs(bookId);
    }

    window.dispatchEvent(new Event(libraryChangedEvent));
  }

  writeRemovedLocalLibraryBooks(removedBooks);
}

export function createNextLocalLibraryBook(
  title: string,
  chapterCount: number,
  options: Partial<Omit<LocalLibraryBook, "title" | "chapterCount" | "updatedAt">> = {},
): LocalLibraryBook {
  const existingBooks = readLocalLibraryBooks();
  const nextIndex = existingBooks.length + 1;

  return {
    bookId: options.bookId ?? `demo-book-${nextIndex}`,
    title: title || `Imported draft ${nextIndex}`,
    chapterCount,
    updatedAt: new Date().toISOString(),
    ...options,
  };
}

export function upsertLocalLibraryBook(nextBook: LocalLibraryBook): void {
  if (typeof window === "undefined") {
    return;
  }

  const existingBooks = readLocalLibraryBooks().filter(
    (book) => book.bookId !== nextBook.bookId,
  );
  const updatedBooks = [
    {
      ...nextBook,
      updatedAt: nextBook.updatedAt ?? new Date().toISOString(),
    },
    ...existingBooks,
  ];

  window.localStorage.setItem(libraryStorageKey, JSON.stringify(updatedBooks));
  window.dispatchEvent(new Event(libraryChangedEvent));
}

export function renameLocalLibraryBook(bookId: string, title: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const existingBook = readLocalLibraryBook(bookId);
  if (!existingBook) {
    return;
  }

  upsertLocalLibraryBook({
    ...existingBook,
    title: title.trim() || existingBook.title,
    updatedAt: new Date().toISOString(),
  });
}

export function touchLocalLibraryBook(bookId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const existingBook = readLocalLibraryBook(bookId);
  if (!existingBook) {
    return;
  }

  upsertLocalLibraryBook({
    ...existingBook,
    updatedAt: new Date().toISOString(),
  });
}

export function readLocalListeningProfiles(): LocalListeningProfile[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(listeningProfileStorageKey);
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as LocalListeningProfile[];
  } catch {
    return [];
  }
}

export function readLocalListeningProfile(
  bookId: string,
): LocalListeningProfile | null {
  return readLocalListeningProfiles().find((profile) => profile.bookId === bookId) ?? null;
}

export function readMostRecentListeningProfile(): LocalListeningProfile | null {
  return readLocalListeningProfiles()[0] ?? null;
}

export function resolveListeningTaste(bookId: string): ResolvedListeningTaste {
  const savedProfile = readLocalListeningProfile(bookId);
  if (savedProfile) {
    return { profile: savedProfile, source: "saved" };
  }

  const defaultProfile = readDefaultListeningProfile();
  if (defaultProfile) {
    return { profile: defaultProfile, source: "default" };
  }

  const recentProfile = readMostRecentListeningProfile();
  if (recentProfile) {
    return { profile: recentProfile, source: "recent" };
  }

  return { profile: null, source: "none" };
}

export function describeListeningTasteSource(
  resolvedTaste: ResolvedListeningTaste,
): ListeningTasteSourceMeta {
  const narratorName = resolvedTaste.profile?.narratorName ?? "your last narrator";
  const mode = resolvedTaste.profile?.mode ?? "ambient";

  if (resolvedTaste.source === "saved") {
    return {
      badge: "Saved taste",
      summary: `${narratorName} in ${mode}`,
      detail:
        "This book already has its own saved listening profile, so it will keep opening the same way until you change it here.",
      actionHint: "Open setup to change this book only.",
    };
  }

  if (resolvedTaste.source === "default") {
    return {
      badge: "Default taste",
      summary: `${narratorName} in ${mode}`,
      detail:
        "This book has not been customized yet, so it is borrowing your global default taste for new imports.",
      actionHint: "Change your default taste to affect future books.",
    };
  }

  if (resolvedTaste.source === "recent") {
    return {
      badge: "Latest taste",
      summary: `${narratorName} in ${mode}`,
      detail:
        "No default taste is saved, so this book is starting from the most recent book you listened to.",
      actionHint: "Save a default taste if you want new books to start more predictably.",
    };
  }

  return {
    badge: "Setup pending",
    summary: "No narrator chosen yet",
    detail:
      "This book has been imported, but it does not have a listening profile yet. Choose a narrator and mode before generating a sample.",
    actionHint: "Continue setup to choose a narrator and listening mode.",
  };
}

export function readDefaultListeningProfile(): LocalListeningProfile | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(defaultListeningProfileStorageKey);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as LocalListeningProfile;
  } catch {
    return null;
  }
}

export function writeDefaultListeningProfile(
  profile: LocalListeningProfile,
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    defaultListeningProfileStorageKey,
    JSON.stringify(profile),
  );
  window.dispatchEvent(new Event(defaultTasteChangedEvent));
}

export function clearDefaultListeningProfile(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(defaultListeningProfileStorageKey);
  window.dispatchEvent(new Event(defaultTasteChangedEvent));
}

export function writeLocalListeningProfile(profile: LocalListeningProfile): void {
  if (typeof window === "undefined") {
    return;
  }

  const profiles = readLocalListeningProfiles();
  const nextProfiles = [
    profile,
    ...profiles.filter((entry) => entry.bookId !== profile.bookId),
  ];

  window.localStorage.setItem(
    listeningProfileStorageKey,
    JSON.stringify(nextProfiles),
  );
  window.dispatchEvent(new Event(listeningProfileChangedEvent));
  touchLocalLibraryBook(profile.bookId);
}

export function removeLocalListeningProfile(bookId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const nextProfiles = readLocalListeningProfiles().filter(
    (profile) => profile.bookId !== bookId,
  );
  window.localStorage.setItem(
    listeningProfileStorageKey,
    JSON.stringify(nextProfiles),
  );
  window.dispatchEvent(new Event(listeningProfileChangedEvent));
}

export function readLocalSampleRequest(): LocalSampleRequest | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(sampleRequestStorageKey);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as LocalSampleRequest;
  } catch {
    return null;
  }
}

export function writeLocalSampleRequest(request: LocalSampleRequest): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(sampleRequestStorageKey, JSON.stringify(request));
  window.dispatchEvent(new Event(sampleRequestChangedEvent));
  touchLocalLibraryBook(request.bookId);
}

export function readLocalGenerationOutputs(): LocalGenerationOutput[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(generationOutputsStorageKey);
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as LocalGenerationOutput[];
  } catch {
    return [];
  }
}

export function readLocalGenerationOutput(
  bookId: string,
  kind: LocalGenerationOutput["kind"],
): LocalGenerationOutput | null {
  return (
    readLocalGenerationOutputs().find(
      (output) => output.bookId === bookId && output.kind === kind,
    ) ?? null
  );
}

export function resolvePreferredGenerationOutput(
  localOutput: LocalGenerationOutput | null,
  syncedOutput: LocalGenerationOutput | null,
): LocalGenerationOutput | null {
  if (!localOutput) {
    return syncedOutput;
  }

  if (!syncedOutput) {
    return localOutput;
  }

  const localGeneratedAt = new Date(localOutput.generatedAt).getTime();
  const syncedGeneratedAt = new Date(syncedOutput.generatedAt).getTime();

  if (Number.isNaN(localGeneratedAt)) {
    return syncedOutput;
  }

  if (Number.isNaN(syncedGeneratedAt)) {
    return localOutput;
  }

  return localGeneratedAt >= syncedGeneratedAt ? localOutput : syncedOutput;
}

export function writeLocalGenerationOutput(output: LocalGenerationOutput): void {
  if (typeof window === "undefined") {
    return;
  }

  const nextOutputs = [
    output,
    ...readLocalGenerationOutputs().filter(
      (entry) =>
        !(entry.bookId === output.bookId && entry.kind === output.kind),
    ),
  ];

  window.localStorage.setItem(
    generationOutputsStorageKey,
    JSON.stringify(nextOutputs),
  );
  window.dispatchEvent(new Event(generationOutputChangedEvent));
  touchLocalLibraryBook(output.bookId);
}

export function clearLocalGenerationOutputs(bookId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const nextOutputs = readLocalGenerationOutputs().filter(
    (output) => output.bookId !== bookId,
  );
  window.localStorage.setItem(
    generationOutputsStorageKey,
    JSON.stringify(nextOutputs),
  );
  window.dispatchEvent(new Event(generationOutputChangedEvent));
}

export function clearLocalSampleRequest(bookId?: string): void {
  if (typeof window === "undefined") {
    return;
  }

  if (bookId) {
    const current = readLocalSampleRequest();
    if (!current || current.bookId !== bookId) {
      return;
    }
  }

  window.localStorage.removeItem(sampleRequestStorageKey);
  window.dispatchEvent(new Event(sampleRequestChangedEvent));
}

export function removeLocalLibraryBook(bookId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const existingBook = readLocalLibraryBook(bookId);
  if (!existingBook) {
    return;
  }

  const snapshot: RemovedLocalLibraryBook = {
    book: existingBook,
    draftText: readLocalDraftText(bookId),
    profile: readLocalListeningProfile(bookId),
    sampleRequest:
      readLocalSampleRequest()?.bookId === bookId ? readLocalSampleRequest() : null,
    playbackState: readPersistedPlaybackState(bookId),
    generationOutputs: readLocalGenerationOutputs().filter(
      (output) => output.bookId === bookId,
    ),
    removedAt: new Date().toISOString(),
  };

  const nextBooks = readLocalLibraryBooks().filter((book) => book.bookId !== bookId);
  window.localStorage.setItem(libraryStorageKey, JSON.stringify(nextBooks));
  writeRemovedLocalLibraryBooks([
    snapshot,
    ...readRemovedLocalLibraryBooks().filter(
      (removedBook) => removedBook.book.bookId !== bookId,
    ),
  ]);
  clearLocalDraftText(bookId);
  removeLocalListeningProfile(bookId);
  clearLocalSampleRequest(bookId);
  clearPersistedPlaybackState(bookId);
  clearLocalGenerationOutputs(bookId);
  window.dispatchEvent(new Event(libraryChangedEvent));
}

export function restoreRemovedLocalLibraryBook(bookId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const removedBooks = readRemovedLocalLibraryBooks();
  const snapshot = removedBooks.find((removedBook) => removedBook.book.bookId === bookId);
  if (!snapshot) {
    return;
  }

  upsertLocalLibraryBook({
    ...snapshot.book,
    updatedAt: new Date().toISOString(),
  });
  writeLocalDraftText(bookId, snapshot.draftText);

  if (snapshot.profile) {
    writeLocalListeningProfile(snapshot.profile);
  }

  if (snapshot.sampleRequest) {
    writeLocalSampleRequest(snapshot.sampleRequest);
  }

  if (snapshot.playbackState) {
    writePersistedPlaybackState(bookId, snapshot.playbackState);
  }

  for (const output of snapshot.generationOutputs) {
    writeLocalGenerationOutput(output);
  }

  writeRemovedLocalLibraryBooks(
    removedBooks.filter((removedBook) => removedBook.book.bookId !== bookId),
  );
}

export function clearRemovedLocalLibraryBook(bookId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  writeRemovedLocalLibraryBooks(
    readRemovedLocalLibraryBooks().filter(
      (removedBook) => removedBook.book.bookId !== bookId,
    ),
  );
}

export function readLibraryTotals() {
  const books = readLocalLibraryBooks();
  const profiles = readLocalListeningProfiles();
  const sampleRequest = readLocalSampleRequest();

  return {
    totalBooks: books.length,
    booksWithSavedTaste: books.filter((book) =>
      profiles.some((profile) => profile.bookId === book.bookId),
    ).length,
    latestSampleBookId: sampleRequest?.bookId ?? null,
  };
}
