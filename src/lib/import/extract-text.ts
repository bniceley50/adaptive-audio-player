import { isSupportedImportExtension } from "@/lib/validation/import-validation";

export async function extractImportText(file: File): Promise<string> {
  if (!isSupportedImportExtension(file.name)) {
    throw new Error("Unsupported file type. Use EPUB, PDF, DOCX, or TXT.");
  }

  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension !== "txt") {
    throw new Error(
      "The first vertical slice only extracts plain text uploads. Use TXT or paste text below.",
    );
  }

  const text = (await file.text()).trim();

  if (!text) {
    throw new Error("The uploaded file was empty.");
  }

  return text;
}
