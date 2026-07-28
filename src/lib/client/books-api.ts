"use client";

export type BookMetadata = {
  bookId: string;
  title: string;
  chapterCount: number;
  updatedAt: string;
};

export type LibraryGenerationKind =
  | "sample-generation"
  | "full-book-generation";
export type LibraryGenerationStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface LibraryBookActivity {
  jobs: Array<{
    completedAt: string | null;
    createdAt: string;
    kind: LibraryGenerationKind;
    status: LibraryGenerationStatus;
  }>;
  outputs: Array<{
    artifactId: string | null;
    artifactUrl: string;
    generatedAt: string;
    isCurrent: boolean;
    jobId: string | null;
    kind: LibraryGenerationKind;
  }>;
  progress: {
    artifactId: string;
    chapterIndex: number | null;
    durationSeconds: number;
    positionSeconds: number;
    updatedAt: string;
  } | null;
}

export type LibraryBookSummary = BookMetadata & {
  activity: LibraryBookActivity;
};

export type CreateBookResult = {
  book: BookMetadata;
  replayed: boolean;
};

export type BookChapter = {
  id: string;
  title: string;
  text: string;
  order: number;
};

export type BookDetail = BookMetadata & {
  manuscript: string;
  chapters: BookChapter[];
};

type MetadataStorage = Pick<Storage, "getItem" | "setItem">;

const libraryStorageKey = "adaptive-audio-player.library.books";
const idempotencyKeyPattern = /^[a-z0-9][a-z0-9._-]*$/;
const bookIdPattern = /^book-[a-z0-9-]+$/;
const chapterIdPattern = /^chapter-[a-z0-9-]+$/;
const maxIdempotencyKeyCharacters = 128;
const maxBookIdCharacters = 128;
const maxExtractedCharacters = 1_000_000;
const maxChapterCount = 300;

export class BooksApiError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(message: string, status: number | null, retryable: boolean) {
    super(message);
    this.name = "BooksApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

function normalizeIdempotencyKey(value: string) {
  const normalized = value.trim().toLowerCase();
  if (
    !normalized ||
    normalized.length > maxIdempotencyKeyCharacters ||
    !idempotencyKeyPattern.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

function isAbortError(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "AbortError"
  );
}

function errorForStatus(status: number) {
  if (status === 400) {
    return new BooksApiError(
      "The book could not be saved because the import is invalid. Review it and try again.",
      status,
      false,
    );
  }

  if (status === 403) {
    return new BooksApiError(
      "The local library could not authorize this import. Reload and try again.",
      status,
      true,
    );
  }

  if (status === 409) {
    return new BooksApiError(
      "This import conflicts with an earlier attempt. Edit the source and try again.",
      status,
      false,
    );
  }

  if (status === 413) {
    return new BooksApiError(
      "This book is too large to save. Shorten it and try again.",
      status,
      false,
    );
  }

  return new BooksApiError(
    "The book could not be saved. Your import is still here; try again.",
    status,
    true,
  );
}

function bookReadErrorForStatus(status: number) {
  if (status === 401 || status === 403) {
    return new BooksApiError(
      "The local library could not authorize this book. Reload and try again.",
      status,
      true,
    );
  }

  if (status === 404) {
    return new BooksApiError(
      "This book is no longer in the local library.",
      status,
      false,
    );
  }

  return new BooksApiError(
    "This book could not be loaded. Reload and try again.",
    status,
    true,
  );
}

function libraryReadErrorForStatus(status: number) {
  if (status === 401 || status === 403) {
    return new BooksApiError(
      "The local library could not be authorized. Reload and try again.",
      status,
      true,
    );
  }

  return new BooksApiError(
    "The library could not be loaded. Reload and try again.",
    status,
    true,
  );
}

function bookDeleteErrorForStatus(status: number) {
  if (status === 401 || status === 403) {
    return new BooksApiError(
      "The local library could not authorize this deletion. Reload and try again.",
      status,
      true,
    );
  }

  return new BooksApiError(
    "This book could not be deleted safely. Try again.",
    status,
    true,
  );
}

function normalizeBookId(value: string) {
  const normalized = value.trim().toLowerCase();
  if (
    !normalized ||
    normalized.length > maxBookIdCharacters ||
    !bookIdPattern.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

function readBookMetadata(value: unknown): BookMetadata | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<BookMetadata>;
  const bookId = candidate.bookId?.trim().toLowerCase() ?? "";
  if (
    !bookIdPattern.test(bookId) ||
    typeof candidate.title !== "string" ||
    !candidate.title.trim() ||
    !Number.isInteger(candidate.chapterCount) ||
    Number(candidate.chapterCount) < 1 ||
    typeof candidate.updatedAt !== "string" ||
    !candidate.updatedAt.trim()
  ) {
    return null;
  }

  return {
    bookId,
    title: candidate.title,
    chapterCount: Number(candidate.chapterCount),
    updatedAt: candidate.updatedAt,
  };
}

function isLibraryGenerationKind(
  value: unknown,
): value is LibraryGenerationKind {
  return value === "sample-generation" || value === "full-book-generation";
}

function isLibraryGenerationStatus(
  value: unknown,
): value is LibraryGenerationStatus {
  return (
    value === "queued" ||
    value === "running" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled"
  );
}

function readLibraryBookActivity(value: unknown): LibraryBookActivity | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<LibraryBookActivity>;
  if (!Array.isArray(candidate.jobs) || !Array.isArray(candidate.outputs)) {
    return null;
  }

  const jobs: LibraryBookActivity["jobs"] = [];
  for (const value of candidate.jobs) {
    if (!value || typeof value !== "object") {
      return null;
    }

    const job = value as Partial<LibraryBookActivity["jobs"][number]>;
    if (
      !isLibraryGenerationKind(job.kind) ||
      !isLibraryGenerationStatus(job.status) ||
      typeof job.createdAt !== "string" ||
      !job.createdAt.trim() ||
      (job.completedAt !== null && typeof job.completedAt !== "string")
    ) {
      return null;
    }

    jobs.push({
      completedAt: job.completedAt,
      createdAt: job.createdAt,
      kind: job.kind,
      status: job.status,
    });
  }

  const outputs: LibraryBookActivity["outputs"] = [];
  for (const value of candidate.outputs) {
    if (!value || typeof value !== "object") {
      return null;
    }

    const output = value as Partial<LibraryBookActivity["outputs"][number]>;
    if (
      !isLibraryGenerationKind(output.kind) ||
      typeof output.artifactUrl !== "string" ||
      !output.artifactUrl.startsWith("/api/audio/") ||
      (output.artifactId !== null && typeof output.artifactId !== "string") ||
      (output.jobId !== null && typeof output.jobId !== "string") ||
      typeof output.generatedAt !== "string" ||
      !output.generatedAt.trim() ||
      typeof output.isCurrent !== "boolean"
    ) {
      return null;
    }

    outputs.push({
      artifactId: output.artifactId,
      artifactUrl: output.artifactUrl,
      generatedAt: output.generatedAt,
      isCurrent: output.isCurrent,
      jobId: output.jobId,
      kind: output.kind,
    });
  }

  let progress: LibraryBookActivity["progress"] = null;
  if (candidate.progress !== null) {
    if (!candidate.progress || typeof candidate.progress !== "object") {
      return null;
    }

    const value = candidate.progress;
    if (
      typeof value.artifactId !== "string" ||
      !value.artifactId.trim() ||
      (value.chapterIndex !== null &&
        (!Number.isInteger(value.chapterIndex) || value.chapterIndex < 0)) ||
      !Number.isFinite(value.durationSeconds) ||
      value.durationSeconds < 0 ||
      !Number.isFinite(value.positionSeconds) ||
      value.positionSeconds < 0 ||
      typeof value.updatedAt !== "string" ||
      !value.updatedAt.trim()
    ) {
      return null;
    }

    progress = {
      artifactId: value.artifactId,
      chapterIndex: value.chapterIndex,
      durationSeconds: value.durationSeconds,
      positionSeconds: value.positionSeconds,
      updatedAt: value.updatedAt,
    };
  }

  return { jobs, outputs, progress };
}

function readLibraryBookSummary(value: unknown): LibraryBookSummary | null {
  const metadata = readBookMetadata(value);
  if (!metadata || !value || typeof value !== "object") {
    return null;
  }

  const activity = readLibraryBookActivity(
    (value as { activity?: unknown }).activity,
  );
  return activity ? { ...metadata, activity } : null;
}

function readBookDetail(value: unknown): BookDetail | null {
  const metadata = readBookMetadata(value);
  if (!metadata || !value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<BookDetail>;
  if (
    typeof candidate.manuscript !== "string" ||
    !candidate.manuscript.trim() ||
    candidate.manuscript.length > maxExtractedCharacters ||
    !Array.isArray(candidate.chapters) ||
    candidate.chapters.length !== metadata.chapterCount ||
    candidate.chapters.length > maxChapterCount
  ) {
    return null;
  }

  const chapterIds = new Set<string>();
  const chapters: BookChapter[] = [];
  for (const [index, value] of candidate.chapters.entries()) {
    if (!value || typeof value !== "object") {
      return null;
    }

    const chapter = value as Partial<BookChapter>;
    const id = chapter.id?.trim().toLowerCase() ?? "";
    if (
      !chapterIdPattern.test(id) ||
      chapterIds.has(id) ||
      typeof chapter.title !== "string" ||
      !chapter.title.trim() ||
      typeof chapter.text !== "string" ||
      chapter.order !== index
    ) {
      return null;
    }

    chapterIds.add(id);
    chapters.push({
      id,
      title: chapter.title,
      text: chapter.text,
      order: index,
    });
  }

  return {
    ...metadata,
    manuscript: candidate.manuscript,
    chapters,
  };
}

export function createBookIdempotencyKey() {
  return `import-${globalThis.crypto.randomUUID()}`.toLowerCase();
}

export async function listBooks(
  options: { signal?: AbortSignal } = {},
): Promise<LibraryBookSummary[]> {
  let response: Response;
  try {
    response = await fetch("/api/books", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal: options.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new BooksApiError(
      "The library could not be loaded. Reload and try again.",
      null,
      true,
    );
  }

  if (!response.ok) {
    throw libraryReadErrorForStatus(response.status);
  }

  const payload = (await response.json().catch(() => null)) as
    | { books?: unknown }
    | null;
  if (!Array.isArray(payload?.books)) {
    throw new BooksApiError(
      "The library returned invalid data. Reload and try again.",
      response.status,
      true,
    );
  }

  const books = payload.books.map(readLibraryBookSummary);
  if (books.some((book) => book === null)) {
    throw new BooksApiError(
      "The library returned invalid data. Reload and try again.",
      response.status,
      true,
    );
  }

  return books as LibraryBookSummary[];
}

export async function getBook(
  bookIdValue: string,
  options: { signal?: AbortSignal } = {},
): Promise<BookDetail> {
  const bookId = normalizeBookId(bookIdValue);
  if (!bookId) {
    throw new BooksApiError(
      "This book could not be opened. Return to the library and try again.",
      null,
      false,
    );
  }

  let response: Response;
  try {
    response = await fetch(`/api/books/${bookId}`, {
      method: "GET",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal: options.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new BooksApiError(
      "This book could not be loaded. Reload and try again.",
      null,
      true,
    );
  }

  if (!response.ok) {
    throw bookReadErrorForStatus(response.status);
  }

  const payload = (await response.json().catch(() => null)) as
    | { book?: unknown }
    | null;
  const book = readBookDetail(payload?.book);
  if (!book) {
    throw new BooksApiError(
      "This book returned invalid data. Reload and try again.",
      response.status,
      true,
    );
  }

  return book;
}

export async function deleteBook(
  bookIdValue: string,
  options: { signal?: AbortSignal } = {},
): Promise<{ deleted: boolean }> {
  const bookId = normalizeBookId(bookIdValue);
  if (!bookId) {
    throw new BooksApiError(
      "This book could not be deleted. Return to the library and try again.",
      null,
      false,
    );
  }

  let response: Response;
  try {
    response = await fetch(`/api/books/${bookId}`, {
      method: "DELETE",
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal: options.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new BooksApiError(
      "This book could not be deleted safely. Try again.",
      null,
      true,
    );
  }

  if (!response.ok) {
    throw bookDeleteErrorForStatus(response.status);
  }

  const payload = (await response.json().catch(() => null)) as
    | { ok?: unknown; deleted?: unknown }
    | null;
  if (payload?.ok !== true || typeof payload.deleted !== "boolean") {
    throw new BooksApiError(
      "This book could not be deleted safely. Try again.",
      response.status,
      true,
    );
  }

  return { deleted: payload.deleted };
}

export async function createBook(input: {
  title: string;
  text: string;
  idempotencyKey: string;
  signal?: AbortSignal;
}): Promise<CreateBookResult> {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (!idempotencyKey) {
    throw new BooksApiError(
      "The import could not be started safely. Edit it and try again.",
      null,
      false,
    );
  }

  let response: Response;
  try {
    response = await fetch("/api/books", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        title: input.title,
        text: input.text,
      }),
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new BooksApiError(
      "The book could not be saved. Your import is still here; try again.",
      null,
      true,
    );
  }

  if (!response.ok) {
    throw errorForStatus(response.status);
  }

  const payload = (await response.json().catch(() => null)) as
    | { book?: unknown; replayed?: unknown }
    | null;
  const book = readBookMetadata(payload?.book);
  if (!book || typeof payload?.replayed !== "boolean") {
    throw new BooksApiError(
      "The book was saved, but its details could not be confirmed. Try again.",
      response.status,
      true,
    );
  }

  return { book, replayed: payload.replayed };
}

export function cacheBookMetadata(
  book: BookMetadata,
  storage: MetadataStorage | null =
    typeof window === "undefined" ? null : window.localStorage,
) {
  if (!storage) {
    return;
  }

  let existingBooks: unknown[] = [];
  try {
    const parsed = JSON.parse(storage.getItem(libraryStorageKey) ?? "[]") as unknown;
    existingBooks = Array.isArray(parsed) ? parsed : [];
  } catch {
    existingBooks = [];
  }

  storage.setItem(
    libraryStorageKey,
    JSON.stringify([
      book,
      ...existingBooks.filter(
        (candidate) =>
          !candidate ||
          typeof candidate !== "object" ||
          (candidate as { bookId?: unknown }).bookId !== book.bookId,
      ),
    ]),
  );
}
