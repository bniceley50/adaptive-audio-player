"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/shared/app-shell";
import { extractImportText } from "@/lib/import/extract-text";
import {
  createNextLocalLibraryBook,
  readRemovedLocalLibraryBooks,
  readDefaultListeningProfile,
  readLibraryTotals,
  upsertLocalLibraryBook,
  writeLocalDraftText,
} from "@/lib/library/local-library";
import { parseChapters } from "@/lib/parser/parse-chapters";

export default function ImportPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fileLabel, setFileLabel] = useState<string>("Paste text or upload a file");
  const [defaultListeningProfile] = useState(() =>
    typeof window !== "undefined" ? readDefaultListeningProfile() : null,
  );
  const [libraryTotals] = useState(() =>
    typeof window !== "undefined"
      ? readLibraryTotals()
      : { totalBooks: 0, booksWithSavedTaste: 0, latestSampleBookId: null },
  );
  const [removedBooks] = useState(() =>
    typeof window !== "undefined" ? readRemovedLocalLibraryBooks() : [],
  );

  const chapters = useMemo(() => parseChapters(sourceText), [sourceText]);
  const trimmedSourceText = sourceText.trim();
  const importState = error
    ? {
        label: "Import needs attention",
        detail: error,
        action: "Fix the source or switch to pasted text.",
        accent:
          "border-rose-200 bg-[linear-gradient(135deg,#fff1f2_0%,#fffaf9_100%)] text-rose-950",
        badge: "border-rose-200 bg-white/80 text-rose-700",
      }
    : chapters.length > 0
      ? {
          label: "Ready for setup",
          detail:
            "The parser found a stable chapter structure. You can move straight into taste design.",
          action: "Continue to voice setup and generate a sample.",
          accent:
            "border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#f8fffc_100%)] text-emerald-950",
          badge: "border-emerald-200 bg-white/80 text-emerald-700",
        }
      : trimmedSourceText
        ? {
            label: "Text is loaded",
            detail:
              "Your draft is in the intake flow. Preview the parsed chapters before you continue.",
            action: "Preview chapters to confirm the structure.",
            accent:
              "border-amber-200 bg-[linear-gradient(135deg,#fff7d8_0%,#fffdf7_100%)] text-amber-950",
            badge: "border-amber-200 bg-white/80 text-amber-700",
          }
        : {
            label: "Ready to import",
            detail:
              "Start by uploading a file or pasting text. The app will parse chapters before narrator setup.",
            action: "Add source text to begin the intake flow.",
            accent:
              "border-stone-200 bg-[linear-gradient(135deg,#faf7ef_0%,#ffffff_100%)] text-stone-950",
            badge: "border-stone-200 bg-white/80 text-stone-600",
          };

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setFileLabel(file.name);

    try {
      const text = await extractImportText(file);
      setSourceText(text);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to read import.");
    }
  }

  function previewPastedText() {
    const trimmed = sourceText.trim();
    if (!trimmed) {
      setError("Paste some text before previewing chapters.");
      return;
    }

    setSourceText(trimmed);
    setError(null);
  }

  function continueToSetup() {
    const trimmed = sourceText.trim();
    if (!trimmed) {
      setError("Preview chapters before moving to voice setup.");
      return;
    }

    const nextBook = createNextLocalLibraryBook(title.trim(), chapters.length);
    writeLocalDraftText(nextBook.bookId, trimmed);
    upsertLocalLibraryBook(nextBook);
    router.push(`/books/${nextBook.bookId}`);
  }

  return (
    <AppShell eyebrow="Step 1" title="Import a book">
      <section className="overflow-hidden rounded-[1.75rem] border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 bg-[linear-gradient(135deg,#f7f0df_0%,#fffdf7_45%,#edf4ff_100%)] p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
                Import flow
              </p>
              <h2 className="mt-2 text-xl font-semibold text-stone-950">
                Import your manuscript
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
                Start with pasted text or a plain text file. EPUB, PDF, and DOCX extraction
                will layer onto this same flow next.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
              <span className="rounded-full border border-white/80 bg-white/80 px-3 py-2 backdrop-blur">
                Guided intake
              </span>
              <span className="rounded-full border border-white/80 bg-white/80 px-3 py-2 backdrop-blur">
                Private import
              </span>
            </div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            {[
              {
                step: "01",
                label: "Import the source",
                detail: "Paste text or upload a file to start the listening workflow.",
                active: true,
              },
              {
                step: "02",
                label: "Design the taste",
                detail: "Pick the narrator and listening mode that fit this title.",
              },
              {
                step: "03",
                label: "Generate the sample",
                detail: "Create the first preview before you commit to a full render.",
              },
              {
                step: "04",
                label: "Listen and promote",
                detail: "Open the player, then move into a full-book render when it feels right.",
              },
            ].map((item) => (
              <article
                key={item.step}
                className={`rounded-[1.35rem] border p-4 shadow-sm ${
                  item.active
                    ? "border-stone-950 bg-stone-950 text-white"
                    : "border-white/80 bg-white/80 text-stone-800"
                }`}
              >
                <p
                  className={`text-[0.68rem] font-semibold uppercase tracking-[0.22em] ${
                    item.active ? "text-stone-300" : "text-stone-500"
                  }`}
                >
                  Step {item.step}
                </p>
                <h3 className="mt-3 text-sm font-semibold">{item.label}</h3>
                <p
                  className={`mt-2 text-sm leading-6 ${
                    item.active ? "text-stone-200" : "text-stone-600"
                  }`}
                >
                  {item.detail}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="p-8">
          <div
            className={`rounded-[1.6rem] border p-5 shadow-sm ${importState.accent}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] ${importState.badge}`}
                  >
                    Current state
                  </span>
                  <span
                    className={`rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] ${importState.badge}`}
                  >
                    {importState.label}
                  </span>
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-6">
                  {importState.detail}
                </p>
                <p className="mt-3 text-sm font-medium">
                  Next move: {importState.action}
                </p>
              </div>
              <div className="grid min-w-[240px] gap-3 sm:grid-cols-3 sm:gap-2">
                <div className="rounded-[1.2rem] border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-current/60">
                    Source
                  </p>
                  <p className="mt-2 text-sm font-semibold text-current">
                    {fileLabel !== "Paste text or upload a file"
                      ? fileLabel
                      : trimmedSourceText
                        ? "Pasted text"
                        : "Waiting for source"}
                  </p>
                </div>
                <div className="rounded-[1.2rem] border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-current/60">
                    Shelf size
                  </p>
                  <p className="mt-2 text-sm font-semibold text-current">
                    {libraryTotals.totalBooks} imported title
                    {libraryTotals.totalBooks === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="rounded-[1.2rem] border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-current/60">
                    Starting taste
                  </p>
                  <p className="mt-2 text-sm font-semibold text-current">
                    {defaultListeningProfile
                      ? `${defaultListeningProfile.narratorName} · ${defaultListeningProfile.mode}`
                      : "Latest taste fallback"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {defaultListeningProfile ? (
            <div className="mt-5 rounded-2xl border border-violet-200 bg-[linear-gradient(135deg,#f6f0ff_0%,#fbf8ff_100%)] px-4 py-4 text-sm text-violet-900 shadow-sm">
              New books will start from your default taste:{" "}
              {defaultListeningProfile.narratorName} in{" "}
              <span className="capitalize">{defaultListeningProfile.mode}</span>. Existing
              books keep their own saved taste.
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <article className="rounded-2xl border border-stone-200 bg-[linear-gradient(180deg,#faf7f0_0%,#ffffff_100%)] p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                Library books
              </p>
              <p className="mt-3 text-2xl font-semibold text-stone-900">
                {libraryTotals.totalBooks}
              </p>
              <p className="mt-2 text-xs leading-5 text-stone-500">
                Imports already living in your private shelf.
              </p>
            </article>
            <article className="rounded-2xl border border-stone-200 bg-[linear-gradient(180deg,#f4f8ff_0%,#ffffff_100%)] p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                Saved tastes
              </p>
              <p className="mt-3 text-2xl font-semibold text-stone-900">
                {libraryTotals.booksWithSavedTaste}
              </p>
              <p className="mt-2 text-xs leading-5 text-stone-500">
                Books already carrying narrator and mode choices.
              </p>
            </article>
            <article className="rounded-2xl border border-stone-200 bg-[linear-gradient(180deg,#fff7ef_0%,#ffffff_100%)] p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                Recently removed
              </p>
              <p className="mt-3 text-2xl font-semibold text-stone-900">
                {removedBooks.length}
              </p>
              <p className="mt-2 text-xs leading-5 text-stone-500">
                Recoverable titles still available from stale links or the home shelf.
              </p>
            </article>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              <div className="rounded-[1.5rem] border border-stone-200 bg-[linear-gradient(180deg,#ffffff_0%,#faf8f4_100%)] p-6 shadow-sm">
                <label className="block text-sm font-medium text-stone-900" htmlFor="book-title">
                  Book title
                </label>
                <input
                  id="book-title"
                  className="mt-3 w-full rounded-[1.5rem] border border-stone-200 bg-white px-5 py-4 text-sm text-stone-800 outline-none transition focus:border-stone-400"
                  name="book-title"
                  placeholder="Name your import"
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
                <p className="mt-3 text-sm text-stone-500">
                  Give this import a shelf-worthy title before you move into setup.
                </p>
              </div>

              <label className="block rounded-[1.5rem] border border-stone-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 text-sm text-stone-700 shadow-sm">
                <span className="block text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                  Upload
                </span>
                <span className="mt-2 block text-lg font-semibold text-stone-900">
                  Upload a file
                </span>
                <span className="mt-2 block text-stone-600">{fileLabel}</span>
                <input
                  className="mt-5 block w-full text-sm text-stone-700 file:mr-4 file:rounded-full file:border-0 file:bg-stone-950 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
                  type="file"
                  accept=".txt,.epub,.pdf,.docx"
                  onChange={handleFileChange}
                />
              </label>

              <div className="rounded-[1.5rem] border border-stone-200 bg-[linear-gradient(180deg,#ffffff_0%,#faf8f4_100%)] p-6 shadow-sm">
                <label className="block text-sm font-medium text-stone-900" htmlFor="source-text">
                  Or paste text
                </label>
                <textarea
                  id="source-text"
                  className="mt-3 min-h-64 w-full rounded-[1.5rem] border border-stone-200 bg-white p-5 text-sm leading-6 text-stone-800 outline-none transition focus:border-stone-400"
                  name="source-text"
                  placeholder={"Chapter 1\nIt was a wet night...\n\nChapter 2\nThe city woke late."}
                  value={sourceText}
                  onChange={(event) => setSourceText(event.target.value)}
                />
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    className="rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-stone-800"
                    type="button"
                    onClick={previewPastedText}
                  >
                    Preview chapters
                  </button>
                  <p className="text-sm text-stone-500">
                    Clean chapter headings here before moving to voice setup.
                  </p>
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-[1.5rem] border border-stone-200 bg-[linear-gradient(180deg,#f9f6ef_0%,#ffffff_100%)] p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                  What happens next
                </p>
                <ol className="mt-4 space-y-3 text-sm text-stone-700">
                  <li className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <span className="font-medium text-stone-950">1. Import</span>
                    <span className="mt-1 block text-stone-600">
                      Upload a file or paste text into the editor.
                    </span>
                  </li>
                  <li className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <span className="font-medium text-stone-950">2. Review chapters</span>
                    <span className="mt-1 block text-stone-600">
                      Check the parse and confirm the book structure feels right.
                    </span>
                  </li>
                  <li className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <span className="font-medium text-stone-950">3. Choose the sound</span>
                    <span className="mt-1 block text-stone-600">
                      Move into narrator and listening-mode setup for the sample.
                    </span>
                  </li>
                </ol>
              </div>

              {removedBooks.length > 0 ? (
                <div className="rounded-[1.5rem] border border-amber-200 bg-[linear-gradient(135deg,#fff7d8_0%,#fffdf7_100%)] p-5 text-sm text-amber-950 shadow-sm">
                  <p className="font-medium">Removed books are still recoverable.</p>
                  <p className="mt-2 leading-6 text-amber-900">
                    Stale setup and player links can restore them, and the home shelf keeps a
                    recently removed list until you dismiss it.
                  </p>
                </div>
              ) : null}

              {error ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </p>
              ) : null}

              {chapters.length > 0 ? (
                <div className="rounded-[1.5rem] border border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#f8fffc_100%)] p-5 text-sm text-emerald-950 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-emerald-700">
                          Ready for setup
                        </span>
                        <span className="rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                          {chapters.length} parsed chapter{chapters.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-emerald-950">
                        {title.trim() || "Untitled import"} is ready for narrator setup
                      </h3>
                      <p className="mt-2 max-w-xl leading-6 text-emerald-900">
                        The import looks valid. The next screen will use this parsed structure,
                        carry over your title, and start from the best available taste profile
                        before you generate the first sample.
                      </p>
                    </div>
                    <div className="rounded-[1.2rem] border border-emerald-200 bg-white/85 px-4 py-4 text-right shadow-sm">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        Starting taste
                      </p>
                      <p className="mt-2 font-semibold text-emerald-950">
                        {defaultListeningProfile
                          ? `${defaultListeningProfile.narratorName} · ${defaultListeningProfile.mode}`
                          : "Latest taste fallback"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-emerald-900">
                        Book-specific saved taste will override this after the first setup pass.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <article className="rounded-2xl border border-emerald-200 bg-white/80 px-4 py-3">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        1. Review the taste
                      </p>
                      <p className="mt-2 leading-6 text-emerald-900">
                        Confirm narrator and listening mode on the setup screen.
                      </p>
                    </article>
                    <article className="rounded-2xl border border-emerald-200 bg-white/80 px-4 py-3">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        2. Generate a sample
                      </p>
                      <p className="mt-2 leading-6 text-emerald-900">
                        Render one sample first before committing to a full-book pass.
                      </p>
                    </article>
                    <article className="rounded-2xl border border-emerald-200 bg-white/80 px-4 py-3">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        3. Start listening
                      </p>
                      <p className="mt-2 leading-6 text-emerald-900">
                        Move into playback once the sample sounds right.
                      </p>
                    </article>
                  </div>
                </div>
              ) : null}

              <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50/80 p-5 shadow-sm">
                <div className="flex flex-wrap gap-3">
                  <button
                    className="rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-stone-800 disabled:bg-stone-300 disabled:text-stone-500"
                    type="button"
                    disabled={chapters.length === 0}
                    onClick={continueToSetup}
                  >
                    Continue to voice setup
                  </button>
                  <Link
                    className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:text-stone-950"
                    href="/"
                  >
                    Back to library
                  </Link>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
      <section className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Import review</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              The first vertical slice focuses on chapter parsing and preview before
              voice setup.
            </p>
          </div>
          <div className="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700">
            {chapters.length} chapter{chapters.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="mt-6 grid gap-4">
          {chapters.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-5 text-sm text-stone-600">
              Add text above to see parsed chapter previews here.
            </div>
          ) : (
            chapters.map((chapter) => (
              <article
                key={chapter.id}
                className="rounded-[1.4rem] border border-stone-200 bg-[linear-gradient(180deg,#faf8f4_0%,#ffffff_100%)] p-5 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-stone-900">
                    {chapter.title}
                  </h3>
                  <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-stone-500">
                    Section {chapter.order + 1}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-stone-600">
                  {chapter.text.slice(0, 220) || "No chapter body found yet."}
                </p>
              </article>
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}
