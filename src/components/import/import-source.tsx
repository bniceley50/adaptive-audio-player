"use client";

export type ImportSourceKind = "file" | "paste";

interface ImportSourceProps {
  disabled?: boolean;
  fileName: string | null;
  isReadingFile?: boolean;
  onFileChange: (file: File | null) => void;
  onSourceKindChange: (kind: ImportSourceKind) => void;
  onTextChange: (text: string) => void;
  selectedKind: ImportSourceKind | null;
  text: string;
}

const sourceOptions = [
  {
    description: "Choose a TXT file or an authorized DRM-free EPUB.",
    kind: "file",
    label: "Choose a file",
  },
  {
    description: "Paste plain book or manuscript text directly.",
    kind: "paste",
    label: "Paste text",
  },
] as const satisfies ReadonlyArray<{
  description: string;
  kind: ImportSourceKind;
  label: string;
}>;

export function ImportSource({
  disabled = false,
  fileName,
  isReadingFile = false,
  onFileChange,
  onSourceKindChange,
  onTextChange,
  selectedKind,
  text,
}: ImportSourceProps) {
  return (
    <section aria-labelledby="import-source-heading">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
          Step 1 of 2
        </p>
        <h2
          className="mt-2 text-2xl font-semibold text-stone-950"
          id="import-source-heading"
        >
          Choose where your book comes from
        </h2>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Supported files: TXT up to 5 MB and DRM-free EPUB up to 25 MB.
          Extracted books may contain up to 1,000,000 characters and 300
          chapters.
        </p>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Use only DRM-free material you own or are authorized to transform.
        </p>
      </div>

      <fieldset className="mt-6" disabled={disabled}>
        <legend className="sr-only">Book source</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {sourceOptions.map((option) => {
            const inputId = `import-source-${option.kind}`;
            const descriptionId = `${inputId}-description`;
            const isSelected = selectedKind === option.kind;

            return (
              <div
                className={`rounded-[1.4rem] border p-5 transition ${
                  isSelected
                    ? "border-[#274c5b] bg-[#eef7f5] shadow-sm"
                    : "border-stone-200 bg-white hover:border-stone-300"
                }`}
                key={option.kind}
              >
                <div className="flex gap-3">
                  <input
                    aria-describedby={descriptionId}
                    checked={isSelected}
                    className="mt-1 h-4 w-4 accent-[#274c5b]"
                    id={inputId}
                    name="import-source"
                    type="radio"
                    value={option.kind}
                    onChange={() => onSourceKindChange(option.kind)}
                  />
                  <span>
                    <label
                      className="block cursor-pointer font-semibold text-stone-950"
                      htmlFor={inputId}
                    >
                      {option.label}
                    </label>
                    <span
                      className="mt-1 block text-sm leading-6 text-stone-600"
                      id={descriptionId}
                    >
                      {option.description}
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {selectedKind === "file" ? (
          <div className="mt-5 rounded-[1.4rem] border border-stone-200 bg-stone-50 p-5">
            <label
              className="block font-semibold text-stone-950"
              htmlFor="import-file"
            >
              Choose a TXT or EPUB file
            </label>
            <p className="mt-1 text-sm leading-6 text-stone-600" id="file-help">
              EPUB files must be DRM-free. PDF, DOCX, MP3, and M4B are not
              supported.
            </p>
            <input
              accept=".txt,.epub,text/plain,application/epub+zip,application/zip"
              aria-describedby="file-help"
              className="mt-4 block w-full text-sm text-stone-700 file:mr-4 file:rounded-full file:border-0 file:bg-[#274c5b] file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white"
              id="import-file"
              type="file"
              onChange={(event) =>
                onFileChange(event.currentTarget.files?.[0] ?? null)
              }
            />
            <p aria-live="polite" className="mt-3 text-sm text-stone-600">
              {isReadingFile
                ? "Reading and checking the selected file…"
                : fileName
                  ? `Selected: ${fileName}`
                  : "No file selected."}
            </p>
          </div>
        ) : null}

        {selectedKind === "paste" ? (
          <div className="mt-5 rounded-[1.4rem] border border-stone-200 bg-stone-50 p-5">
            <label
              className="block font-semibold text-stone-950"
              htmlFor="import-text"
            >
              Paste book text
            </label>
            <p className="mt-1 text-sm leading-6 text-stone-600" id="text-help">
              Include chapter headings when possible. You can review the
              detected chapters before anything is saved.
            </p>
            <textarea
              aria-describedby="text-help"
              className="mt-4 min-h-64 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm leading-6 text-stone-900 outline-none transition focus:border-[#274c5b] focus:ring-4 focus:ring-[#274c5b]/10"
              id="import-text"
              placeholder="Chapter 1\nPaste your book text here…"
              value={text}
              onChange={(event) => onTextChange(event.currentTarget.value)}
            />
          </div>
        ) : null}
      </fieldset>
    </section>
  );
}
