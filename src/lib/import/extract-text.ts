import { isSupportedTextImportExtension } from "@/lib/validation/import-validation";

export async function extractImportText(file: File): Promise<string> {
  if (!isSupportedTextImportExtension(file.name)) {
    throw new Error("Text uploads currently support TXT files only.");
  }

  const text = (await file.text()).trim();

  if (!text) {
    throw new Error("The uploaded file was empty.");
  }

  return text;
}
