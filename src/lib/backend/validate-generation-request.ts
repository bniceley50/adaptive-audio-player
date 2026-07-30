import type { GenerationJobKind } from "@/lib/backend/types";
import {
  FAST_NARRATION_ENGINE_ID,
  getNarrationEngineDefinition,
  type NarrationEngineId,
} from "@/lib/narration/engines";
import {
  MAX_EXTRACTED_TEXT_CHARACTERS,
  MAX_IMPORT_CHAPTERS,
} from "@/lib/validation/import-validation";
import {
  getVoiceCatalogEntry,
  voiceSupportsNarrationEngine,
  type VoiceId,
} from "@/lib/voices/catalog";

export const COMPATIBILITY_NARRATION_MODE = "classic" as const;

export type GenerationVoiceId = VoiceId;

export interface StoredGenerationBookForValidation {
  workspaceId: string;
  bookId: string;
  chapterCount: number;
  text: string;
}

export interface ExistingGenerationJobForValidation {
  workspaceId: string;
  bookId: string;
  kind: string;
  status: string;
}

export interface ValidateGenerationRequestInput {
  workspaceId: unknown;
  bookId: unknown;
  kind: unknown;
  narratorId: unknown;
  engineId?: unknown;
  mode: unknown;
  book: StoredGenerationBookForValidation | null;
  existingJobs?: readonly ExistingGenerationJobForValidation[];
}

export interface ValidatedGenerationRequest {
  workspaceId: string;
  bookId: string;
  kind: GenerationJobKind;
  narratorId: GenerationVoiceId;
  engineId: NarrationEngineId;
  mode: typeof COMPATIBILITY_NARRATION_MODE;
  chapterCount: number;
}

export type GenerationRequestValidationErrorCode =
  | "invalid-request"
  | "book-not-found"
  | "book-access-denied"
  | "unsupported-voice"
  | "unsupported-engine"
  | "unsupported-mode"
  | "invalid-chapter-count"
  | "invalid-book-text"
  | "book-text-too-long"
  | "duplicate-active-job";

export type GenerationRequestValidationResult =
  | { ok: true; value: ValidatedGenerationRequest }
  | {
      ok: false;
      error: {
        code: GenerationRequestValidationErrorCode;
        message: string;
      };
    };

const safeIdentifierPattern = /^[a-z0-9](?:[a-z0-9._-]{0,127})$/;
const activeJobStatuses = new Set(["queued", "running"]);
const generationJobKinds = new Set<GenerationJobKind>([
  "sample-generation",
  "full-book-generation",
]);

function normalizeBoundaryString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function isSafeIdentifier(value: string | null): value is string {
  return value !== null && safeIdentifierPattern.test(value);
}

function isGenerationJobKind(value: string | null): value is GenerationJobKind {
  return value !== null && generationJobKinds.has(value as GenerationJobKind);
}

function isGenerationVoiceId(value: string | null): value is GenerationVoiceId {
  return getVoiceCatalogEntry(value) !== null;
}

function validationError(
  code: GenerationRequestValidationErrorCode,
  message: string,
): GenerationRequestValidationResult {
  return { ok: false, error: { code, message } };
}

export function validateGenerationRequest(
  input: ValidateGenerationRequestInput,
): GenerationRequestValidationResult {
  const workspaceId = normalizeBoundaryString(input.workspaceId);
  const bookId = normalizeBoundaryString(input.bookId);
  const kind = normalizeBoundaryString(input.kind);
  const narratorId = normalizeBoundaryString(input.narratorId);
  const engineId =
    getNarrationEngineDefinition(input.engineId)?.id ??
    (input.engineId === undefined || input.engineId === null
      ? FAST_NARRATION_ENGINE_ID
      : null);
  const mode = normalizeBoundaryString(input.mode);

  if (
    !isSafeIdentifier(workspaceId) ||
    !isSafeIdentifier(bookId) ||
    !isGenerationJobKind(kind)
  ) {
    return validationError(
      "invalid-request",
      "Choose a valid book before generating audio.",
    );
  }

  if (!isGenerationVoiceId(narratorId)) {
    return validationError(
      "unsupported-voice",
      "Choose an available narrator before generating audio.",
    );
  }

  if (!engineId) {
    return validationError(
      "unsupported-engine",
      "Choose an available listening quality before generating audio.",
    );
  }

  if (!voiceSupportsNarrationEngine(narratorId, engineId)) {
    return validationError(
      "unsupported-voice",
      "Choose a narrator available for the selected listening quality.",
    );
  }

  if (mode !== COMPATIBILITY_NARRATION_MODE) {
    return validationError(
      "unsupported-mode",
      "Only narration is available for generation.",
    );
  }

  if (!input.book) {
    return validationError(
      "book-not-found",
      "This book is not available for generation.",
    );
  }

  const storedBookId = normalizeBoundaryString(input.book.bookId);
  if (storedBookId !== bookId) {
    return validationError(
      "book-not-found",
      "This book is not available for generation.",
    );
  }

  const storedWorkspaceId = normalizeBoundaryString(input.book.workspaceId);
  if (storedWorkspaceId !== workspaceId) {
    return validationError(
      "book-access-denied",
      "This book is not available for generation.",
    );
  }

  const chapterCount = input.book.chapterCount;
  if (
    !Number.isInteger(chapterCount) ||
    chapterCount < 1 ||
    chapterCount > MAX_IMPORT_CHAPTERS
  ) {
    return validationError(
      "invalid-chapter-count",
      "This book's chapters could not be prepared for generation.",
    );
  }

  const text = input.book.text;
  if (typeof text !== "string" || !text.trim()) {
    return validationError(
      "invalid-book-text",
      "This book does not contain readable text for generation.",
    );
  }

  if (text.length > MAX_EXTRACTED_TEXT_CHARACTERS) {
    return validationError(
      "book-text-too-long",
      "This book is too long to generate. Shorten it before continuing.",
    );
  }

  const hasDuplicateActiveJob = (input.existingJobs ?? []).some((job) => {
    const jobWorkspaceId = normalizeBoundaryString(job.workspaceId);
    const jobBookId = normalizeBoundaryString(job.bookId);
    const jobKind = normalizeBoundaryString(job.kind);
    const jobStatus = normalizeBoundaryString(job.status);

    return (
      jobWorkspaceId === workspaceId &&
      jobBookId === bookId &&
      jobKind === kind &&
      jobStatus !== null &&
      activeJobStatuses.has(jobStatus)
    );
  });

  if (hasDuplicateActiveJob) {
    return validationError(
      "duplicate-active-job",
      "Audio generation is already in progress for this book.",
    );
  }

  return {
    ok: true,
    value: {
      workspaceId,
      bookId,
      kind,
      narratorId,
      engineId,
      mode: COMPATIBILITY_NARRATION_MODE,
      chapterCount,
    },
  };
}
