import { describe, expect, it } from "vitest";
import {
  getSupportedAudioImportExtension,
  isSupportedAudioImportExtension,
  isSupportedImportExtension,
  isSupportedTextImportExtension,
} from "@/lib/validation/import-validation";

describe("isSupportedImportExtension", () => {
  it("accepts supported file extensions", () => {
    expect(isSupportedImportExtension("book.epub")).toBe(true);
    expect(isSupportedImportExtension("notes.PDF")).toBe(true);
    expect(isSupportedImportExtension("chapter.txt")).toBe(true);
    expect(isSupportedImportExtension("story.mp3")).toBe(true);
    expect(isSupportedImportExtension("memo.M4B")).toBe(true);
  });

  it("rejects unsupported file extensions", () => {
    expect(isSupportedImportExtension("archive.zip")).toBe(false);
    expect(isSupportedImportExtension("book")).toBe(false);
  });

  it("separates text and audio support", () => {
    expect(isSupportedTextImportExtension("book.txt")).toBe(true);
    expect(isSupportedTextImportExtension("book.mp3")).toBe(false);
    expect(isSupportedAudioImportExtension("book.mp3")).toBe(true);
    expect(isSupportedAudioImportExtension("book.m4b")).toBe(true);
    expect(isSupportedAudioImportExtension("book.pdf")).toBe(false);
  });

  it("returns the supported audio extension when present", () => {
    expect(getSupportedAudioImportExtension("book.mp3")).toBe("mp3");
    expect(getSupportedAudioImportExtension("book.m4b")).toBe("m4b");
    expect(getSupportedAudioImportExtension("book.txt")).toBe(null);
  });
});
