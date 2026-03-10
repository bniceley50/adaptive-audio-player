const supportedImportTypes = ["epub", "pdf", "docx", "txt"] as const;

export function isSupportedImportExtension(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase();
  return (
    !!ext &&
    supportedImportTypes.includes(
      ext as (typeof supportedImportTypes)[number],
    )
  );
}
