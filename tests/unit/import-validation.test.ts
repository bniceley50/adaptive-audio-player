import { describe, expect, it } from "vitest";
import { isSupportedImportExtension } from "@/lib/validation/import-validation";

describe("isSupportedImportExtension", () => {
  it("accepts supported file extensions", () => {
    expect(isSupportedImportExtension("book.epub")).toBe(true);
    expect(isSupportedImportExtension("notes.PDF")).toBe(true);
  });

  it("rejects unsupported file extensions", () => {
    expect(isSupportedImportExtension("archive.zip")).toBe(false);
    expect(isSupportedImportExtension("book")).toBe(false);
  });
});
