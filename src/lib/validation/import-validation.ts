const supportedTextImportTypes = ["txt"] as const;
const supportedEpubImportTypes = ["epub"] as const;
const supportedTextImportMimeTypes = ["text/plain"] as const;
const supportedEpubImportMimeTypes = [
  "application/epub+zip",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
] as const;

export const MAX_TXT_IMPORT_BYTES = 5_000_000;
export const MAX_EPUB_IMPORT_BYTES = 25_000_000;
export const MAX_EXTRACTED_TEXT_CHARACTERS = 1_000_000;
export const MAX_IMPORT_TITLE_CHARACTERS = 200;
export const MAX_IMPORT_CHAPTERS = 300;

export interface TextImportFileMetadata {
  name: string;
  size: number;
  type: string;
}

export interface ImportDraftValidationInput {
  chapterCount: number;
  text: string;
  title: string;
}

export function getImportExtension(filename: string): string | null {
  const normalizedFilename = filename.trim().toLowerCase();
  const extensionMatch = normalizedFilename.match(/\.([^.]+)$/);
  return extensionMatch?.[1] ?? null;
}

export function isSupportedTextImportExtension(filename: string): boolean {
  const ext = getImportExtension(filename);
  return (
    !!ext &&
    supportedTextImportTypes.includes(
      ext as (typeof supportedTextImportTypes)[number],
    )
  );
}

export function isSupportedEpubImportExtension(filename: string): boolean {
  const ext = getImportExtension(filename);
  return (
    !!ext &&
    supportedEpubImportTypes.includes(
      ext as (typeof supportedEpubImportTypes)[number],
    )
  );
}

export function isSupportedImportExtension(filename: string): boolean {
  return (
    isSupportedTextImportExtension(filename) ||
    isSupportedEpubImportExtension(filename)
  );
}

export function getTextImportFileValidationError(
  file: TextImportFileMetadata,
): string | null {
  if (!isSupportedTextImportExtension(file.name)) {
    return "Choose a plain-text TXT file. Other file formats are not available yet.";
  }

  const normalizedMimeType = file.type.trim().toLowerCase();
  if (
    normalizedMimeType &&
    !supportedTextImportMimeTypes.includes(
      normalizedMimeType as (typeof supportedTextImportMimeTypes)[number],
    )
  ) {
    return "This file is not identified as plain text. Choose a TXT file with the text/plain file type.";
  }

  if (!Number.isFinite(file.size) || file.size < 0) {
    return "This file size could not be verified. Choose another TXT file.";
  }

  if (file.size > MAX_TXT_IMPORT_BYTES) {
    return "This TXT file is larger than 5 MB. Choose a smaller file.";
  }

  return null;
}

export function getEpubImportFileValidationError(
  file: TextImportFileMetadata,
): string | null {
  if (!isSupportedEpubImportExtension(file.name)) {
    return "Choose a DRM-free EPUB file. Other archive formats are not supported.";
  }

  const normalizedMimeType = file.type.trim().toLowerCase();
  if (
    normalizedMimeType &&
    !supportedEpubImportMimeTypes.includes(
      normalizedMimeType as (typeof supportedEpubImportMimeTypes)[number],
    )
  ) {
    return "This file is not identified as an EPUB. Choose a DRM-free EPUB file.";
  }

  if (!Number.isFinite(file.size) || file.size < 0) {
    return "This file size could not be verified. Choose another EPUB file.";
  }

  if (file.size > MAX_EPUB_IMPORT_BYTES) {
    return "This EPUB file is larger than 25 MB. Choose a smaller file.";
  }

  return null;
}

export function getImportedTextValidationError(text: string): string | null {
  if (!text.trim()) {
    return "Add book text before continuing.";
  }

  if (text.length > MAX_EXTRACTED_TEXT_CHARACTERS) {
    return "This book is longer than 1,000,000 characters. Shorten it before continuing.";
  }

  return null;
}

export function getImportDraftValidationError({
  chapterCount,
  text,
  title,
}: ImportDraftValidationInput): string | null {
  const textError = getImportedTextValidationError(text);
  if (textError) {
    return textError;
  }

  if (title.trim().length > MAX_IMPORT_TITLE_CHARACTERS) {
    return "Use a book title with 200 characters or fewer.";
  }

  if (!Number.isInteger(chapterCount) || chapterCount < 1) {
    return "No readable chapters were found. Check the book text before continuing.";
  }

  if (chapterCount > MAX_IMPORT_CHAPTERS) {
    return "This book has more than 300 chapters. Split it into smaller books before continuing.";
  }

  return null;
}
