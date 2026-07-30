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
import {
  transcribeAudioBook,
  type AudioTranscriptDraft,
} from "@/lib/client/transcriptions-api";
import { extractImportSource } from "@/lib/import/extract-text";
import { parseChapters } from "@/lib/parser/parse-chapters";
import { buildApprovedTranscriptManuscript } from "@/lib/transcription/transcript-review";
import {
  MAX_EXTRACTED_TEXT_CHARACTERS,
  MAX_IMPORT_TITLE_CHARACTERS,
  getImportDraftValidationError,
} from "@/lib/validation/import-validation";

type ImportStage = "review" | "source" | "transcript-review";
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
  const transcriptionControllerRef = useRef<AbortController | null>(null);
  const [stage, setStage] = useState<ImportStage>("source");
  const [selectedSourceKind, setSelectedSourceKind] =
    useState<ImportSourceKind | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [chapters, setChapters] = useState<ParsedChapters>([]);
  const [audioDraft, setAudioDraft] =
    useState<AudioTranscriptDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  useEffect(() => {
    return () => {
      fileReadSequenceRef.current += 1;
      submissionControllerRef.current?.abort();
      transcriptionControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (stage !== "source") {
      reviewHeadingRef.current?.focus();
      return;
    }

    if (!shouldFocusSourceRef.current) {
      return;
    }

    shouldFocusSourceRef.current = false;
    const targetId =
      selectedSourceKind === "file"
        ? "import-file"
        : selectedSourceKind === "audio"
          ? "import-audio-file"
          : "import-text";
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
    transcriptionControllerRef.current?.abort();
    transcriptionControllerRef.current = null;
    setSelectedSourceKind(kind);
    setStage("source");
    setSourceText("");
    setTitle("");
    setAuthor(null);
    setFileName(null);
    setChapters([]);
    setAudioDraft(null);
    setError(null);
    setIsReadingFile(false);
    setIsTranscribing(false);
    resetSubmissionIdentity();
  }

  function changePastedText(text: string) {
    setSourceText(text);
    setTitle((currentTitle) => currentTitle || "Untitled book");
    setAuthor(null);
    setFileName(null);
    setChapters([]);
    setAudioDraft(null);
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
    setAudioDraft(null);
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

  async function transcribeAudio(file: File | null) {
    if (!file || transcriptionControllerRef.current) {
      return;
    }

    const sequence = fileReadSequenceRef.current + 1;
    fileReadSequenceRef.current = sequence;
    const controller = new AbortController();
    transcriptionControllerRef.current = controller;
    setIsTranscribing(true);
    setFileName(file.name);
    setSourceText("");
    setTitle("");
    setAuthor(null);
    setChapters([]);
    setAudioDraft(null);
    setError(null);
    resetSubmissionIdentity();

    try {
      const transcript = await transcribeAudioBook(file, {
        signal: controller.signal,
      });
      if (
        controller.signal.aborted ||
        fileReadSequenceRef.current !== sequence
      ) {
        return;
      }

      setAudioDraft(transcript);
      setTitle(transcript.title);
      setAuthor(transcript.author);
      setFileName(transcript.sourceFileName);
      setStage("transcript-review");
    } catch (transcriptionError) {
      if (
        controller.signal.aborted ||
        (transcriptionError &&
          typeof transcriptionError === "object" &&
          "name" in transcriptionError &&
          transcriptionError.name === "AbortError")
      ) {
        return;
      }
      setError(
        transcriptionError instanceof Error
          ? transcriptionError.message
          : "This audiobook could not be transcribed locally. Choose another file.",
      );
    } finally {
      if (transcriptionControllerRef.current === controller) {
        transcriptionControllerRef.current = null;
        setIsTranscribing(false);
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

  function changeTranscriptChapter(
    order: number,
    field: "text" | "title",
    value: string,
  ) {
    setAudioDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            chapters: currentDraft.chapters.map((chapter) =>
              chapter.order === order
                ? { ...chapter, [field]: value }
                : chapter,
            ),
          }
        : null,
    );
    setError(null);
    resetSubmissionIdentity();
  }

  function approveTranscript() {
    if (!audioDraft) {
      setError("Choose and transcribe an MP3 or M4B before continuing.");
      return;
    }

    try {
      const approvedText = buildApprovedTranscriptManuscript(
        audioDraft.chapters,
      );
      const approvedTitle = title.trim() || "Untitled audiobook";
      const approvedChapters = parseChapters(approvedText);
      const validationError = getImportDraftValidationError({
        chapterCount: approvedChapters.length,
        text: approvedText,
        title: approvedTitle,
      });
      if (validationError) {
        setError(validationError);
        return;
      }

      setSourceText(approvedText);
      setTitle(approvedTitle);
      setChapters(approvedChapters);
      setError(null);
      setStage("review");
      resetSubmissionIdentity();
    } catch (approvalError) {
      setError(
        approvalError instanceof Error
          ? approvalError.message
          : "Review every transcript chapter before approving it.",
      );
    }
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
              disabled={isSubmitting || isTranscribing}
              fileName={fileName}
              isReadingFile={isReadingFile}
              isTranscribing={isTranscribing}
              selectedKind={selectedSourceKind}
              text={sourceText}
              onAudioFileChange={(file) => void transcribeAudio(file)}
              onFileChange={(file) => void readFile(file)}
              onSourceKindChange={chooseSource}
              onTextChange={changePastedText}
            />
          ) : stage === "transcript-review" && audioDraft ? (
            <section aria-labelledby="transcript-review-heading">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                Step 2 of 3
              </p>
              <h2
                className="mt-2 text-2xl font-semibold text-stone-950 outline-none"
                id="transcript-review-heading"
                ref={reviewHeadingRef}
                tabIndex={-1}
              >
                Review and approve transcript
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
                Local speech-to-text can mishear names, punctuation, and
                dialogue. Edit every chapter below. Nothing enters your library
                or narration workflow until you explicitly approve this text.
              </p>

              <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div>
                  <label
                    className="block text-sm font-semibold text-stone-950"
                    htmlFor="transcript-book-title"
                  >
                    Book title
                  </label>
                  <input
                    className="mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-base text-stone-950 outline-none transition focus:border-[#274c5b] focus:ring-4 focus:ring-[#274c5b]/10"
                    id="transcript-book-title"
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
                    <dt className="font-medium text-stone-500">Local source</dt>
                    <dd className="mt-1 break-words font-semibold text-stone-950">
                      {audioDraft.sourceFileName}
                    </dd>
                  </div>
                  {audioDraft.author ? (
                    <div>
                      <dt className="font-medium text-stone-500">Creator metadata</dt>
                      <dd className="mt-1 font-semibold text-stone-950">
                        {audioDraft.author}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="font-medium text-stone-500">Recording</dt>
                    <dd className="mt-1 font-semibold text-stone-950">
                      {Math.floor(audioDraft.durationSeconds / 60)} min ·{" "}
                      {audioDraft.chapters.length} transcript
                      {audioDraft.chapters.length === 1 ? " chapter" : " chapters"}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="mt-6">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-stone-950">
                      Editable transcript
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-stone-600">
                      The original recording has already been removed from the
                      app&apos;s temporary workspace.
                    </p>
                  </div>
                  <p className="text-xs text-stone-500">
                    {audioDraft.chapters.reduce(
                      (total, chapter) => total + chapter.text.length,
                      0,
                    ).toLocaleString()} of{" "}
                    {MAX_EXTRACTED_TEXT_CHARACTERS.toLocaleString()} characters
                  </p>
                </div>
                <ol className="mt-3 space-y-4">
                  {audioDraft.chapters.map((chapter) => {
                    const titleId = `transcript-chapter-title-${chapter.order}`;
                    const textId = `transcript-chapter-text-${chapter.order}`;
                    return (
                      <li
                        className="rounded-[1.4rem] border border-stone-200 bg-stone-50 p-4 sm:p-5"
                        key={chapter.id}
                      >
                        <label
                          className="block text-sm font-semibold text-stone-950"
                          htmlFor={titleId}
                        >
                          Chapter {chapter.order + 1} title
                        </label>
                        <input
                          className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-[#274c5b] focus:ring-4 focus:ring-[#274c5b]/10"
                          id={titleId}
                          maxLength={MAX_IMPORT_TITLE_CHARACTERS}
                          value={chapter.title}
                          onChange={(event) =>
                            changeTranscriptChapter(
                              chapter.order,
                              "title",
                              event.currentTarget.value,
                            )
                          }
                        />
                        <label
                          className="mt-4 block text-sm font-semibold text-stone-950"
                          htmlFor={textId}
                        >
                          Chapter {chapter.order + 1} transcript
                        </label>
                        <textarea
                          className="mt-2 min-h-64 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm leading-6 text-stone-900 outline-none transition focus:border-[#274c5b] focus:ring-4 focus:ring-[#274c5b]/10"
                          id={textId}
                          maxLength={MAX_EXTRACTED_TEXT_CHARACTERS}
                          value={chapter.text}
                          onChange={(event) =>
                            changeTranscriptChapter(
                              chapter.order,
                              "text",
                              event.currentTarget.value,
                            )
                          }
                        />
                      </li>
                    );
                  })}
                </ol>
              </div>
            </section>
          ) : (
            <section aria-labelledby="import-review-heading">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                {selectedSourceKind === "audio" ? "Step 3 of 3" : "Step 2 of 2"}
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
              selectedSourceKind === "audio" ? (
                <button
                  className={primaryActionClass}
                  disabled={isTranscribing || !audioDraft}
                  type="button"
                  onClick={() => setStage("transcript-review")}
                >
                  {isTranscribing
                    ? "Transcribing locally…"
                    : audioDraft
                      ? "Review transcript"
                      : "Choose audio to transcribe"}
                </button>
              ) : (
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
              )
            ) : stage === "transcript-review" ? (
              <button
                className={primaryActionClass}
                type="button"
                onClick={approveTranscript}
              >
                Approve transcript and continue
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

            {stage !== "source" ? (
              <button
                className={secondaryActionClass}
                disabled={isSubmitting}
                type="button"
                onClick={returnToSource}
              >
                {stage === "transcript-review"
                  ? "Choose different source"
                  : "Change source"}
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
