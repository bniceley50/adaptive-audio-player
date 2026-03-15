const supportedTextImportTypes = ["txt"] as const;
const supportedAudioImportTypes = ["mp3", "m4b"] as const;
const supportedFutureImportTypes = ["epub", "pdf", "docx"] as const;

export type SupportedAudioImportExtension =
  (typeof supportedAudioImportTypes)[number];

export function getImportExtension(filename: string): string | null {
  return filename.split(".").pop()?.toLowerCase() ?? null;
}

export function isSupportedTextImportExtension(filename: string): boolean {
  const ext = getImportExtension(filename);
  return (
    !!ext &&
    supportedTextImportTypes.includes(
      ext as (typeof supportedTextImportTypes)[number],
    )
  );
}

export function isSupportedAudioImportExtension(filename: string): boolean {
  const ext = getImportExtension(filename);
  return (
    !!ext &&
    supportedAudioImportTypes.includes(
      ext as (typeof supportedAudioImportTypes)[number],
    )
  );
}

export function getSupportedAudioImportExtension(
  filename: string,
): SupportedAudioImportExtension | null {
  const ext = getImportExtension(filename);
  return isSupportedAudioImportExtension(filename)
    ? (ext as SupportedAudioImportExtension)
    : null;
}

export function isSupportedImportExtension(filename: string): boolean {
  return (
    isSupportedTextImportExtension(filename) ||
    isSupportedAudioImportExtension(filename) ||
    (() => {
      const ext = getImportExtension(filename);
      return (
        !!ext &&
        supportedFutureImportTypes.includes(
          ext as (typeof supportedFutureImportTypes)[number],
        )
      );
    })()
  );
}
