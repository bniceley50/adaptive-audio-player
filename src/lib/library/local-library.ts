import {
  clearPersistedPlaybackState,
} from "@/lib/playback/local-playback";
import type {
  PublicGenerationOutputSummary,
  SyncJobSummary,
} from "@/lib/backend/types";
import {
  FAST_NARRATION_ENGINE_ID,
  type NarrationEngineId,
} from "@/lib/narration/engines";

export interface LocalLibraryBook {
  bookId: string;
  title: string;
  chapterCount: number;
  updatedAt: string;
  coverTheme?: string;
  coverLabel?: string;
  coverGlyph?: string;
  genreLabel?: string;
}

const libraryStorageKey = "adaptive-audio-player.library.books";
const sampleRequestStorageKey = "adaptive-audio-player.sample-request";
const libraryChangedEvent = "adaptive-audio-player.library-changed";
const sampleRequestChangedEvent =
  "adaptive-audio-player.sample-request-changed";

export interface LocalSampleRequest {
  bookId: string;
  narratorId: string;
  engineId?: NarrationEngineId;
  mode: string;
}

type SampleGenerationStatus =
  | "not-requested"
  | "requested"
  | "queued"
  | "running"
  | "completed-with-artifact"
  | "failed"
  | "cancelled"
  | "stale"
  | "missing-artifact";

interface SampleGenerationState {
  isPlayable: boolean;
  status: SampleGenerationStatus;
}

interface ResolveSampleGenerationStateInput {
  bookId: string;
  narratorId: string;
  engineId?: NarrationEngineId;
  mode: string;
  request: LocalSampleRequest | null;
  job: Pick<
    SyncJobSummary,
    "id" | "bookId" | "engineId" | "narratorId" | "mode" | "status"
  > | null;
  output: Pick<
    PublicGenerationOutputSummary,
    | "artifactId"
    | "artifactUrl"
    | "bookId"
    | "engineId"
    | "isCurrent"
    | "jobId"
    | "narratorId"
    | "mode"
  > | null;
}

function matchesSampleSelection(
  candidate: {
    bookId: string | null;
    narratorId: string | null;
    engineId?: NarrationEngineId;
    mode: string | null;
  },
  selection: {
    bookId: string;
    engineId: NarrationEngineId;
    narratorId: string;
    mode: string;
  },
): boolean {
  return (
    candidate.bookId === selection.bookId &&
    (candidate.engineId ?? FAST_NARRATION_ENGINE_ID) === selection.engineId &&
    candidate.narratorId === selection.narratorId &&
    candidate.mode === selection.mode
  );
}

export function resolveSampleGenerationState({
  bookId,
  engineId,
  narratorId,
  mode,
  request,
  job,
  output,
}: ResolveSampleGenerationStateInput): SampleGenerationState {
  const selection = {
    bookId,
    engineId: engineId ?? FAST_NARRATION_ENGINE_ID,
    narratorId,
    mode,
  };
  const jobMatchesSelection = Boolean(
    job && matchesSampleSelection(job, selection),
  );
  const outputMatchesSelection = Boolean(
    output && matchesSampleSelection(output, selection),
  );
  const outputIsPlayable = Boolean(
    outputMatchesSelection &&
      output?.isCurrent &&
      output.artifactId?.trim() &&
      output.jobId?.trim() &&
      output.artifactUrl.trim().startsWith("/api/audio/"),
  );

  if (jobMatchesSelection && job) {
    if (job.status === "queued" || job.status === "running") {
      return { isPlayable: false, status: job.status };
    }

    if (job.status === "failed" || job.status === "cancelled") {
      return { isPlayable: false, status: job.status };
    }

    if (job.status === "completed") {
      if (outputIsPlayable && output?.jobId === job.id) {
        return { isPlayable: true, status: "completed-with-artifact" };
      }

      return {
        isPlayable: false,
        status: output && !outputMatchesSelection ? "stale" : "missing-artifact",
      };
    }
  }

  if (outputIsPlayable) {
    return { isPlayable: true, status: "completed-with-artifact" };
  }

  if (request && matchesSampleSelection(request, selection)) {
    return { isPlayable: false, status: "requested" };
  }

  if (request || job || output) {
    return { isPlayable: false, status: "stale" };
  }

  return { isPlayable: false, status: "not-requested" };
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

export function readLocalLibraryBook(bookId: string): LocalLibraryBook | null {
  return readLocalLibraryBooks().find((book) => book.bookId === bookId) ?? null;
}

function getLocalDraftStorageKey(bookId: string): string {
  return `adaptive-audio-player.library.draft.${bookId}`;
}

function clearLegacyLocalDraftText(bookId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(getLocalDraftStorageKey(bookId));
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
  clearLegacyLocalDraftText(nextBook.bookId);
  window.dispatchEvent(new Event(libraryChangedEvent));
}

function touchLocalLibraryBook(bookId: string): void {
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

function readLocalSampleRequest(): LocalSampleRequest | null {
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

function clearLocalSampleRequest(bookId?: string): void {
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

  const nextBooks = readLocalLibraryBooks().filter((book) => book.bookId !== bookId);
  window.localStorage.setItem(libraryStorageKey, JSON.stringify(nextBooks));
  clearLegacyLocalDraftText(bookId);
  clearLocalSampleRequest(bookId);
  clearPersistedPlaybackState(bookId);
  window.dispatchEvent(new Event(libraryChangedEvent));
}
