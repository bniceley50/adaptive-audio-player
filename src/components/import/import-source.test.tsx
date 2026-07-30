/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImportSource, type ImportSourceKind } from "./import-source";

const roots: Root[] = [];
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function renderImportSource(
  overrides: Partial<{
    fileName: string | null;
    isReadingFile: boolean;
    isTranscribing: boolean;
    selectedKind: ImportSourceKind | null;
    text: string;
  }> = {},
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const onFileChange = vi.fn();
  const onAudioFileChange = vi.fn();
  const onSourceKindChange = vi.fn();
  const onTextChange = vi.fn();

  act(() => {
    root.render(
      <ImportSource
        fileName={overrides.fileName ?? null}
        isReadingFile={overrides.isReadingFile ?? false}
        isTranscribing={overrides.isTranscribing ?? false}
        selectedKind={overrides.selectedKind ?? null}
        text={overrides.text ?? ""}
        onAudioFileChange={onAudioFileChange}
        onFileChange={onFileChange}
        onSourceKindChange={onSourceKindChange}
        onTextChange={onTextChange}
      />,
    );
  });

  return {
    container,
    onAudioFileChange,
    onFileChange,
    onSourceKindChange,
    onTextChange,
  };
}

afterEach(() => {
  for (const root of roots.splice(0, roots.length)) {
    act(() => root.unmount());
  }
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("ImportSource", () => {
  it("shows supported formats and three concise source choices", () => {
    const { container } = renderImportSource();
    const radios = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')];

    expect(container.textContent).toContain("TXT up to 5 MB");
    expect(container.textContent).toContain("DRM-free EPUB up to 25 MB");
    expect(container.textContent).toContain("1,000,000 characters");
    expect(container.textContent).toContain("300 chapters");
    expect(container.textContent).toContain("MP3");
    expect(container.textContent).toContain("M4B");
    expect(radios.map((radio) => radio.labels?.[0]?.textContent)).toEqual([
      "Choose a file",
      "Paste text",
      "Re-narrate audio",
    ]);
  });

  it("reports the selected source through native radio controls", () => {
    const { container, onSourceKindChange } = renderImportSource();
    const paste = container.querySelector<HTMLInputElement>(
      "#import-source-paste",
    );

    expect(paste).not.toBeNull();
    act(() => paste?.click());
    expect(onSourceKindChange).toHaveBeenCalledWith("paste");
  });

  it("shows only the control for the selected source", () => {
    const fileRender = renderImportSource({ selectedKind: "file" });
    const fileInput = fileRender.container.querySelector<HTMLInputElement>(
      "#import-file",
    );

    expect(fileInput?.accept).toBe(
      ".txt,.epub,text/plain,application/epub+zip,application/zip",
    );
    expect(fileRender.container.querySelector("#import-text")).toBeNull();

    const pasteRender = renderImportSource({
      selectedKind: "paste",
      text: "Chapter 1\nOpening",
    });
    expect(pasteRender.container.querySelector("#import-file")).toBeNull();
    expect(
      pasteRender.container.querySelector<HTMLTextAreaElement>("#import-text")
        ?.value,
    ).toBe("Chapter 1\nOpening");
  });

  it("reports the chosen file without reading it inside the component", () => {
    const { container, onFileChange } = renderImportSource({
      selectedKind: "file",
    });
    const input = container.querySelector<HTMLInputElement>("#import-file");
    const file = new File(["Chapter 1\nOpening"], "book.txt", {
      type: "text/plain",
    });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });

    act(() => input?.dispatchEvent(new Event("change", { bubbles: true })));
    expect(onFileChange).toHaveBeenCalledWith(file);
  });

  it("reports authorized audio through a separate local-transcription input", () => {
    const { container, onAudioFileChange } = renderImportSource({
      selectedKind: "audio",
    });
    const input = container.querySelector<HTMLInputElement>(
      "#import-audio-file",
    );
    const file = new File(["ID3"], "alice.mp3", { type: "audio/mpeg" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });

    act(() => input?.dispatchEvent(new Event("change", { bubbles: true })));

    expect(input?.accept).toContain(".m4b");
    expect(container.textContent).toContain("does not clone the original narrator");
    expect(onAudioFileChange).toHaveBeenCalledWith(file);
  });
});
