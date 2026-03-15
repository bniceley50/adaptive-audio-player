"use client";

import {
  getSupportedAudioImportExtension,
  type SupportedAudioImportExtension,
} from "@/lib/validation/import-validation";

const databaseName = "adaptive-audio-player-audio-assets";
const storeName = "audio-files";

export interface ImportedAudioAssetMetadata {
  bookId: string;
  fileName: string;
  mimeType: string;
  format: SupportedAudioImportExtension;
  sizeBytes: number;
  durationSeconds: number | null;
  importedAt: string;
}

interface StoredImportedAudioRecord {
  bookId: string;
  file: Blob;
  metadata: ImportedAudioAssetMetadata;
}

function openAudioDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser does not support local audiobook storage."));
      return;
    }

    const request = indexedDB.open(databaseName, 1);

    request.onerror = () => {
      reject(request.error ?? new Error("Unable to open local audiobook storage."));
    };

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: "bookId" });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

function readAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = document.createElement("audio");

    function cleanup() {
      audio.src = "";
      URL.revokeObjectURL(objectUrl);
    }

    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const nextDuration = Number.isFinite(audio.duration) ? audio.duration : null;
      cleanup();
      resolve(nextDuration);
    };
    audio.onerror = () => {
      cleanup();
      resolve(null);
    };
    audio.src = objectUrl;
  });
}

export async function saveImportedAudioFile(
  bookId: string,
  file: File,
): Promise<ImportedAudioAssetMetadata> {
  const format = getSupportedAudioImportExtension(file.name);
  if (!format) {
    throw new Error("Private audiobook imports currently support MP3 and M4B.");
  }

  const metadata: ImportedAudioAssetMetadata = {
    bookId,
    fileName: file.name,
    mimeType: file.type || (format === "m4b" ? "audio/mp4" : "audio/mpeg"),
    format,
    sizeBytes: file.size,
    durationSeconds: await readAudioDuration(file),
    importedAt: new Date().toISOString(),
  };

  const database = await openAudioDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.put({
      bookId,
      file,
      metadata,
    } satisfies StoredImportedAudioRecord);

    request.onerror = () => {
      reject(request.error ?? new Error("Unable to save the audiobook file."));
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("Unable to save the audiobook file."));
    };
  });

  database.close();
  return metadata;
}

export async function readImportedAudioAssetUrl(bookId: string): Promise<string | null> {
  const database = await openAudioDatabase();

  const record = await new Promise<StoredImportedAudioRecord | null>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.get(bookId);

    request.onerror = () => {
      reject(request.error ?? new Error("Unable to load the audiobook file."));
    };

    request.onsuccess = () => {
      resolve((request.result as StoredImportedAudioRecord | undefined) ?? null);
    };
  });

  database.close();
  return record ? URL.createObjectURL(record.file) : null;
}

export function clearImportedAudioAssets(): void {
  if (typeof indexedDB === "undefined") {
    return;
  }

  indexedDB.deleteDatabase(databaseName);
}
