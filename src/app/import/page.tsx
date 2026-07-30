"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  ImportSource,
  type ImportSourceKind,
} from "@/components/import/import-source";
import { AppShell } from "@/components/shared/app-shell";
import {
  cacheBookMetadata,
  createBook,
  createBookIdempotencyKey,
} from "@/lib/client/books-api";
import { extractImportSource } from "@/lib/import/extract-text";
import { parseChapters } from "@/lib/parser/parse-chapters";
import {
  MAX_IMPORT_TITLE_CHARACTERS,
  getImportDraftValidationError,
} from "@/lib/validation/import-validation";

type ImportStage = "source" | "review";
type ParsedChapters = ReturnType<typeof parseChapters>;

const primaryActionClass =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-[#274c5b] px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_-24px_rgba(39,76,91,0.9)] transition hover:bg-[#1f3d49] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600";
const secondaryActionClass =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60";

function suggestTitleFromFilename(filename: string): string {
  const baseName = filename.replace(/\.[^.]+$/u, "").trim();
  const collapsed = baseName.replace(/[_-]+/gu, " ").replace(/\s+/gu, " ").trim();

  return collapsed.replace(/\b([a-z])/gu, (match) => match.toUpperCase());
}

export default function ImportPage() {
  const router = useRouter();
  const reviewHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const shouldFocusSourceRef = useRef(false);
  const importIdempotencyKeyRef = useRef<string | null>(null);
  const fileReadSequenceRef = useRef(0);
  const submissionControllerRef = useRef<AbortController | null>(null);
  const [stage, setStage] = useState<ImportStage>("source");
  const [selectedSourceKind, setSelectedSourceKind] =
    useState<ImportSourceKind | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [chapters, setChapters] = useState<ParsedChapters>([]);
  const [error, setError] = useState<string | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    return () => {
      fileReadSequenceRef.current += 1;
      submissionControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (stage === "review") {
      reviewHeadingRef.current?.focus();
      return;
    }

    if (!shouldFocusSourceRef.current) {
      return;
    }

    shouldFocusSourceRef.current = false;
    const targetId =
      selectedSourceKind === "file" ? "import-file" : "import-text";
    document.getElementById(targetId)?.focus();
  }, [selectedSourceKind, stage]);

  function resetSubmissionIdentity() {
    importIdempotencyKeyRef.current = null;
  }

  function chooseSource(kind: ImportSourceKind) {
    if (kind === selectedSourceKind) {
      return;
    }

    fileReadSequenceRef.current += 1;
    setSelectedSourceKind(kind);
    setStage("source");
    setSourceText("");
    setTitle("");
    setAuthor(null);
    setFileName(null);
    setChapters([]);
    setError(null);
    setIsReadingFile(false);
    resetSubmissionIdentity();
  }

  function changePastedText(text: string) {
    setSourceText(text);
    setTitle((currentTitle) => currentTitle || "Untitled book");
    setAuthor(null);
    setFileName(null);
    setChapters([]);
    setError(null);
    resetSubmissionIdentity();
  }

  async function readFile(file: File | null) {
    if (!file) {
      return;
    }

    const sequence = fileReadSequenceRef.current + 1;
    fileReadSequenceRef.current = sequence;
    setIsReadingFile(true);
    setFileName(file.name);
    setSourceText("");
    setTitle("");
    setAuthor(null);
    setChapters([]);
    setError(null);
    resetSubmissionIdentity();

    try {
      const extracted = await extractImportSource(file);
      if (fileReadSequenceRef.current !== sequence) {
        return;
      }

      setSourceText(extracted.text);
      setTitle(
        extracted.title || suggestTitleFromFilename(file.name) || "Untitled book",
      );
      setAuthor(extracted.author);
    } catch (readError) {
      if (fileReadSequenceRef.current !== sequence) {
        return;
      }

      setSourceText("");
      setError(
        readError instanceof Error
          ? readError.message
          : "This book could not be read. Choose another source.",
      );
    } finally {
      if (fileReadSequenceRef.current === sequence) {
        setIsReadingFile(false);
      }
    }
  }

  function reviewSource() {
    const trimmedText = sourceText.trim();
    const nextTitle = title.trim() || "Untitled book";
    const nextChapters = parseChapters(trimmedText);
    const validationError = getImportDraftValidationError({
      chapterCount: nextChapters.length,
      text: trimmedText,
      title: nextTitle,
    });

    if (validationError) {
      setError(validationError);
      return;
    }

    setSourceText(trimmedText);
    setTitle(nextTitle);
    setChapters(nextChapters);
    setError(null);
    setStage("review");
  }

  function changeTitle(nextTitle: string) {
    setTitle(nextTitle);
    setError(null);
    resetSubmissionIdentity();
  }

  function returnToSource() {
    shouldFocusSourceRef.current = true;
    setStage("source");
    setError(null);
    setChapters([]);
  }

  async function addBook() {
    if (submissionControllerRef.current) {
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Add a book title before continuing.");
      return;
    }

    const trimmedText = sourceText.trim();
    const validationError = getImportDraftValidationError({
      chapterCount: chapters.length,
      text: trimmedText,
      title: trimmedTitle,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    const idempotencyKey =
      importIdempotencyKeyRef.current ?? createBookIdempotencyKey();
    importIdempotencyKeyRef.current = idempotencyKey;
    const controller = new AbortController();
    submissionControllerRef.current = controller;
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await createBook({
        idempotencyKey,
        signal: controller.signal,
        text: trimmedText,
        title: trimmedTitle,
      });
      if (controller.signal.aborted) {
        return;
      }

      cacheBookMetadata(result.book);
      router.push(`/books/${result.book.bookId}`);
    } catch (submissionError) {
      if (
        controller.signal.aborted ||
        (submissionError &&
          typeof submissionError === "object" &&
          "name" in submissionError &&
          submissionError.name === "AbortError")
      ) {
        return;
      }

      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "The book could not be saved. Your review is still here; try again.",
      );
    } finally {
      if (submissionControllerRef.current === controller) {
        submissionControllerRef.current = null;
        setIsSubmitting(false);
      }
    }
  }

  return (
    <AppShell eyebrow="Add book" title="Add a book">
      <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-[0_24px_70px_-46px_rgba(28,25,23,0.4)]">
        <div className="border-b border-stone-200 bg-[linear-gradient(135deg,#fff8e8_0%,#ffffff_50%,#eef7f5_100%)] p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">
            Private local import
          </p>
          <h2 className="mt-2 max-w-3xl text-2xl font-semibold text-stone-950 sm:text-3xl">
            Add the book first, then choose how it sounds
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
            Choose one source, review the title and chapters, and add it to your
            private library. Narration starts on the next screen.
          </p>
        </div>

        <div className="p-6 sm:p-8">
          {stage === "source" ? (
            <ImportSource
              disabled={isSubmitting}
              fileName={fileName}
              isReadingFile={isReadingFile}
              selectedKind={selectedSourceKind}
              text={sourceText}
              onFileChange={(file) => void readFile(file)}
              onSourceKindChange={chooseSource}
              onTextChange={changePastedText}
            />
          ) : (
            <section aria-labelledby="import-review-heading">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                Step 2 of 2
              </p>
              <h2
                className="mt-2 text-2xl font-semibold text-stone-950 outline-none"
                id="import-review-heading"
                ref={reviewHeadingRef}
                tabIndex={-1}
              >
                Review your book
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
                Check the title and detected chapters. Nothing is added until
                you choose Add book.
              </p>

              <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div>
                  <label
                    className="block text-sm font-semibold text-stone-950"
                    htmlFor="book-title"
                  >
                    Book title
                  </label>
                  <input
                    className="mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-base text-stone-950 outline-none transition focus:border-[#274c5b] focus:ring-4 focus:ring-[#274c5b]/10"
                    disabled={isSubmitting}
                    id="book-title"
                    maxLength={MAX_IMPORT_TITLE_CHARACTERS}
                    value={title}
                    onChange={(event) => changeTitle(event.currentTarget.value)}
                  />
                  <p className="mt-2 text-xs text-stone-500">
                    {title.length} of {MAX_IMPORT_TITLE_CHARACTERS} characters
                  </p>
                </div>

                <dl className="grid gap-3 rounded-[1.4rem] border border-stone-200 bg-stone-50 p-4 text-sm">
                  <div>
                    <dt className="font-medium text-stone-500">Source</dt>
                    <dd className="mt-1 font-semibold text-stone-950">
                      {fileName ?? "Pasted text"}
                    </dd>
                  </div>
                  {author ? (
                    <div>
                      <dt className="font-medium text-stone-500">Author</dt>
                      <dd className="mt-1 font-semibold text-stone-950">
                        {author}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="font-medium text-stone-500">Chapters</dt>
                    <dd className="mt-1 font-semibold text-stone-950">
                      {chapters.length} detected
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="mt-6">
                <h3 className="text-lg font-semibold text-stone-950">
                  Detected chapters
                </h3>
                <ol className="mt-3 max-h-[30rem] space-y-3 overflow-y-auto rounded-[1.4rem] border border-stone-200 bg-stone-50 p-4">
                  {chapters.map((chapter) => (
                    <li
                      className="rounded-xl border border-stone-200 bg-white p-4"
                      key={chapter.id}
                    >
                      <h4 className="font-semibold text-stone-950">
                        {chapter.title}
                      </h4>
                      <p className="mt-2 text-sm leading-6 text-stone-600">
                        {chapter.text.slice(0, 180) ||
                          "No chapter body was detected."}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          )}

          {error ? (
            <div
              className="mt-5 rounded-[1.4rem] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"
              role="alert"
            >
              <p className="font-semibold">This book needs attention</p>
              <p className="mt-1 leading-6 text-rose-800">{error}</p>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-stone-200 pt-6">
            {stage === "source" ? (
              <button
                className={primaryActionClass}
                disabled={
                  isReadingFile || isSubmitting || !sourceText.trim()
                }
                type="button"
                onClick={reviewSource}
              >
                {isReadingFile ? "Reading book…" : "Review book"}
              </button>
            ) : (
              <button
                className={primaryActionClass}
                disabled={isSubmitting}
                type="button"
                onClick={() => void addBook()}
              >
                {isSubmitting ? "Adding book…" : "Add book"}
              </button>
            )}

            {stage === "review" ? (
              <button
                className={secondaryActionClass}
                disabled={isSubmitting}
                type="button"
                onClick={returnToSource}
              >
                Change source
              </button>
            ) : null}

            <Link className={secondaryActionClass} href="/">
              Back to library
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
