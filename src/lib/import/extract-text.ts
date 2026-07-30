import {
  BlobReader,
  ZipReader,
  type Entry,
  type FileEntry,
} from "@zip.js/zip.js";

import {
  MAX_EXTRACTED_TEXT_CHARACTERS,
  MAX_IMPORT_CHAPTERS,
  MAX_IMPORT_TITLE_CHARACTERS,
  getEpubImportFileValidationError,
  getImportedTextValidationError,
  getTextImportFileValidationError,
  isSupportedEpubImportExtension,
  isSupportedTextImportExtension,
} from "@/lib/validation/import-validation";

export const MAX_EPUB_ARCHIVE_ENTRIES = 1_000;
export const MAX_EPUB_TOTAL_EXPANDED_BYTES = 100_000_000;
export const MAX_EPUB_COMPRESSION_RATIO = 200;
export const MAX_EPUB_PATH_DEPTH = 16;

export interface ExtractedImportSource {
  author: string | null;
  text: string;
  title: string | null;
}

const MAX_EPUB_READ_ENTRY_BYTES = 12_000_000;
const MIN_EPUB_RATIO_CHECK_BYTES = 100_000;
const MAX_EPUB_PATH_CHARACTERS = 2_048;
const MAX_EPUB_PATH_SEGMENT_CHARACTERS = 255;
const MAX_EPUB_CHAPTER_TITLE_CHARACTERS = 200;
const EPUB_MIMETYPE = "application/epub+zip";
const EPUB_DRM_PATHS = new Set([
  "meta-inf/encryption.xml",
  "meta-inf/rights.xml",
]);
const EPUB_GENERIC_ERROR =
  "This EPUB could not be read safely. Choose another DRM-free EPUB.";
const EPUB_STRUCTURE_ERROR =
  "This EPUB is missing required book structure or contains damaged content.";
const EPUB_LAYOUT_ERROR =
  "This EPUB contains an unsafe file layout. Choose another DRM-free EPUB.";
const EPUB_RESOURCE_ERROR =
  "This EPUB expands beyond the supported safety limits. Choose a smaller EPUB.";
const EPUB_DRM_ERROR =
  "This EPUB is encrypted or DRM-protected. Choose a DRM-free EPUB you are authorized to use.";

class EpubImportError extends Error {}

interface ManifestItem {
  id: string;
  mediaType: string;
  path: string;
  properties: Set<string>;
}

interface ArchiveContext {
  entriesByPath: Map<string, FileEntry>;
  readText: (path: string) => Promise<string>;
}

function failEpub(message: string): never {
  throw new EpubImportError(message);
}

function normalizePathKey(path: string) {
  return path.normalize("NFC").toLowerCase();
}

function normalizeArchivePath(
  rawPath: string,
  { allowTrailingSlash = false, decodePercent = false } = {},
): string {
  let path = rawPath.trim().normalize("NFC");

  if (decodePercent) {
    try {
      path = decodeURIComponent(path).normalize("NFC");
    } catch {
      failEpub(EPUB_LAYOUT_ERROR);
    }
  }

  if (
    !path ||
    path.length > MAX_EPUB_PATH_CHARACTERS ||
    path.includes("\\") ||
    path.startsWith("/") ||
    path.startsWith("//") ||
    /^[a-z]:/i.test(path) ||
    /[\u0000-\u001f\u007f]/u.test(path)
  ) {
    failEpub(EPUB_LAYOUT_ERROR);
  }

  const segments = path.split("/");
  if (allowTrailingSlash && segments.at(-1) === "") {
    segments.pop();
  }

  if (
    segments.length === 0 ||
    segments.length > MAX_EPUB_PATH_DEPTH ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.length > MAX_EPUB_PATH_SEGMENT_CHARACTERS,
    )
  ) {
    failEpub(EPUB_LAYOUT_ERROR);
  }

  return segments.join("/");
}

function normalizeRootReference(reference: string): string {
  const path = reference.trim().split(/[?#]/u, 1)[0];
  if (!path || /^[a-z][a-z\d+.-]*:/iu.test(path)) {
    failEpub(EPUB_LAYOUT_ERROR);
  }

  return normalizeArchivePath(path, { decodePercent: true });
}

function resolveArchiveReference(basePath: string, reference: string): string {
  const referencePath = reference.trim().split(/[?#]/u, 1)[0];
  if (
    !referencePath ||
    referencePath.startsWith("/") ||
    referencePath.startsWith("//") ||
    /^[a-z][a-z\d+.-]*:/iu.test(referencePath)
  ) {
    failEpub(EPUB_LAYOUT_ERROR);
  }

  const normalizedReference = normalizeArchivePath(referencePath, {
    decodePercent: true,
  });
  const baseSegments = basePath.split("/");
  baseSegments.pop();

  return normalizeArchivePath([...baseSegments, normalizedReference].join("/"));
}

function isUnixSymlink(entry: Entry) {
  const unixMode = entry.unixMode ?? entry.unixExternalUpper;
  return typeof unixMode === "number" && (unixMode & 0o170000) === 0o120000;
}

function inspectArchiveEntries(entries: Entry[]): Map<string, FileEntry> {
  if (entries.length > MAX_EPUB_ARCHIVE_ENTRIES) {
    failEpub("This EPUB contains too many files to import safely.");
  }

  if (entries.length === 0) {
    failEpub(EPUB_STRUCTURE_ERROR);
  }

  const firstEntry = entries[0];
  const firstPath = normalizeArchivePath(firstEntry.filename, {
    allowTrailingSlash: firstEntry.directory,
  });
  if (
    firstEntry.directory ||
    firstPath !== "mimetype" ||
    firstEntry.compressionMethod !== 0
  ) {
    failEpub(EPUB_STRUCTURE_ERROR);
  }

  const entriesByPath = new Map<string, FileEntry>();
  const knownPaths = new Set<string>();
  let totalExpandedBytes = 0;

  for (const entry of entries) {
    const path = normalizeArchivePath(entry.filename, {
      allowTrailingSlash: entry.directory,
    });
    const pathKey = normalizePathKey(path);

    if (knownPaths.has(pathKey)) {
      failEpub(EPUB_LAYOUT_ERROR);
    }
    knownPaths.add(pathKey);

    if (entry.encrypted || EPUB_DRM_PATHS.has(pathKey)) {
      failEpub(EPUB_DRM_ERROR);
    }

    if (entry.diskNumberStart !== 0 || isUnixSymlink(entry)) {
      failEpub(EPUB_LAYOUT_ERROR);
    }

    if (
      !Number.isSafeInteger(entry.compressedSize) ||
      entry.compressedSize < 0 ||
      !Number.isSafeInteger(entry.uncompressedSize) ||
      entry.uncompressedSize < 0
    ) {
      failEpub(EPUB_RESOURCE_ERROR);
    }

    totalExpandedBytes += entry.uncompressedSize;
    if (
      !Number.isSafeInteger(totalExpandedBytes) ||
      totalExpandedBytes > MAX_EPUB_TOTAL_EXPANDED_BYTES
    ) {
      failEpub(EPUB_RESOURCE_ERROR);
    }

    if (
      entry.uncompressedSize >= MIN_EPUB_RATIO_CHECK_BYTES &&
      (entry.compressedSize === 0 ||
        entry.uncompressedSize / entry.compressedSize >
          MAX_EPUB_COMPRESSION_RATIO)
    ) {
      failEpub(EPUB_RESOURCE_ERROR);
    }

    if (entry.directory) {
      continue;
    }

    if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
      failEpub(EPUB_GENERIC_ERROR);
    }

    entriesByPath.set(pathKey, entry);
  }

  return entriesByPath;
}

function decodeArchiveText(bytes: Uint8Array): string {
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder("utf-16le", { fatal: true }).decode(
        bytes.subarray(2),
      );
    }

    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder("utf-16be", { fatal: true }).decode(
        bytes.subarray(2),
      );
    }

    const content =
      bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
        ? bytes.subarray(3)
        : bytes;
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    failEpub(EPUB_STRUCTURE_ERROR);
  }
}

function createArchiveContext(entries: Entry[]): ArchiveContext {
  const entriesByPath = inspectArchiveEntries(entries);
  const byteCache = new Map<string, Uint8Array>();
  const textCache = new Map<string, string>();
  let totalActualBytes = 0;

  async function readBytes(path: string): Promise<Uint8Array> {
    const normalizedPath = normalizeArchivePath(path);
    const pathKey = normalizePathKey(normalizedPath);
    const cached = byteCache.get(pathKey);
    if (cached) {
      return cached;
    }

    const entry = entriesByPath.get(pathKey);
    if (!entry) {
      failEpub(EPUB_STRUCTURE_ERROR);
    }

    const chunks: Uint8Array[] = [];
    let entryBytes = 0;
    const sink = new WritableStream<Uint8Array>({
      write(chunk) {
        entryBytes += chunk.byteLength;
        totalActualBytes += chunk.byteLength;

        if (
          entryBytes > MAX_EPUB_READ_ENTRY_BYTES ||
          totalActualBytes > MAX_EPUB_TOTAL_EXPANDED_BYTES
        ) {
          failEpub(EPUB_RESOURCE_ERROR);
        }

        chunks.push(chunk.slice());
      },
    });

    await entry.getData(sink, {
      checkOverlappingEntry: true,
      checkSignature: true,
      strictness: "strict",
      useWebWorkers: false,
    });

    const bytes = new Uint8Array(entryBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    byteCache.set(pathKey, bytes);
    return bytes;
  }

  async function readText(path: string): Promise<string> {
    const pathKey = normalizePathKey(normalizeArchivePath(path));
    const cached = textCache.get(pathKey);
    if (cached !== undefined) {
      return cached;
    }

    const text = decodeArchiveText(await readBytes(path));
    textCache.set(pathKey, text);
    return text;
  }

  return { entriesByPath, readText };
}

function parseXmlDocument(source: string): Document {
  if (
    /<!(?:ENTITY|ATTLIST|ELEMENT|NOTATION)\b/iu.test(source) ||
    (source.match(/<!DOCTYPE[\s\S]*?>/giu) ?? []).some(
      (doctype) => !/^<!DOCTYPE\s+html\s*>$/iu.test(doctype.trim()),
    )
  ) {
    failEpub(EPUB_STRUCTURE_ERROR);
  }

  const document = new DOMParser().parseFromString(source, "application/xml");
  if (
    !document.documentElement ||
    document.documentElement.localName.toLowerCase() === "parsererror" ||
    document.getElementsByTagNameNS("*", "parsererror").length > 0
  ) {
    failEpub(EPUB_STRUCTURE_ERROR);
  }

  return document;
}

function elementsByLocalName(
  parent: Document | Element,
  localName: string,
): Element[] {
  return Array.from(parent.getElementsByTagNameNS("*", localName));
}

function normalizeDisplayText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/gu, " ").trim();
}

function readPackageManifest(
  packageDocument: Document,
  packagePath: string,
): Map<string, ManifestItem> {
  const manifest = new Map<string, ManifestItem>();

  for (const item of elementsByLocalName(packageDocument, "item")) {
    const id = item.getAttribute("id")?.trim() ?? "";
    const href = item.getAttribute("href")?.trim() ?? "";
    const mediaType = item.getAttribute("media-type")?.trim().toLowerCase() ?? "";

    if (!id || !href || !mediaType || manifest.has(id)) {
      failEpub(EPUB_STRUCTURE_ERROR);
    }

    manifest.set(id, {
      id,
      mediaType,
      path: resolveArchiveReference(packagePath, href),
      properties: new Set(
        (item.getAttribute("properties") ?? "")
          .trim()
          .toLowerCase()
          .split(/\s+/u)
          .filter(Boolean),
      ),
    });
  }

  if (manifest.size === 0) {
    failEpub(EPUB_STRUCTURE_ERROR);
  }

  return manifest;
}

function addNavigationTitle(
  titles: Map<string, string>,
  path: string,
  title: string | null | undefined,
) {
  const normalizedTitle = normalizeDisplayText(title).slice(
    0,
    MAX_EPUB_CHAPTER_TITLE_CHARACTERS,
  );
  if (normalizedTitle) {
    titles.set(normalizePathKey(path), normalizedTitle);
  }
}

async function readNavigationTitles(
  archive: ArchiveContext,
  manifest: Map<string, ManifestItem>,
  spine: Element,
): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  const navigationItem = [...manifest.values()].find((item) =>
    item.properties.has("nav"),
  );

  if (navigationItem) {
    const navigationDocument = parseXmlDocument(
      await archive.readText(navigationItem.path),
    );
    const navigationElements = elementsByLocalName(navigationDocument, "nav");
    const tableOfContents =
      navigationElements.find((element) => {
        const type =
          element.getAttributeNS("http://www.idpf.org/2007/ops", "type") ??
          element.getAttribute("epub:type") ??
          element.getAttribute("type") ??
          "";
        return type.toLowerCase().split(/\s+/u).includes("toc");
      }) ?? navigationElements[0];

    if (tableOfContents) {
      for (const anchor of elementsByLocalName(tableOfContents, "a")) {
        const href = anchor.getAttribute("href");
        if (!href) {
          continue;
        }

        addNavigationTitle(
          titles,
          resolveArchiveReference(navigationItem.path, href),
          anchor.textContent,
        );
      }
    }
  }

  const ncxId = spine.getAttribute("toc")?.trim();
  const ncxItem =
    (ncxId ? manifest.get(ncxId) : undefined) ??
    [...manifest.values()].find(
      (item) => item.mediaType === "application/x-dtbncx+xml",
    );

  if (ncxItem) {
    const ncxDocument = parseXmlDocument(await archive.readText(ncxItem.path));
    for (const navPoint of elementsByLocalName(ncxDocument, "navPoint")) {
      const content = elementsByLocalName(navPoint, "content")[0];
      const label = elementsByLocalName(navPoint, "text")[0];
      const source = content?.getAttribute("src");
      if (source) {
        addNavigationTitle(
          titles,
          resolveArchiveReference(ncxItem.path, source),
          label?.textContent,
        );
      }
    }
  }

  return titles;
}

function extractReadableDocumentText(document: Document): string {
  const body = elementsByLocalName(document, "body")[0];
  if (!body) {
    failEpub(EPUB_STRUCTURE_ERROR);
  }

  const parts: string[] = [];
  const excludedElements = new Set([
    "script",
    "style",
    "noscript",
    "template",
    "svg",
  ]);

  function visit(node: Node) {
    if (node.nodeType === 3) {
      parts.push(node.nodeValue ?? "");
      return;
    }

    if (node.nodeType !== 1) {
      return;
    }

    const element = node as Element;
    if (excludedElements.has(element.localName.toLowerCase())) {
      return;
    }

    for (const child of Array.from(element.childNodes)) {
      visit(child);
      parts.push(" ");
    }
  }

  visit(body);
  return normalizeDisplayText(parts.join(" "));
}

function findDocumentTitle(document: Document): string {
  const heading = Array.from(document.getElementsByTagName("*")).find((element) =>
    /^h[1-6]$/u.test(element.localName.toLowerCase()),
  );
  const title = heading ?? elementsByLocalName(document, "title")[0];
  return normalizeDisplayText(title?.textContent).slice(
    0,
    MAX_EPUB_CHAPTER_TITLE_CHARACTERS,
  );
}

function readPackageMetadata(packageDocument: Document) {
  const metadata = elementsByLocalName(packageDocument, "metadata")[0];
  if (!metadata) {
    return { author: null, title: null };
  }

  const title = normalizeDisplayText(
    elementsByLocalName(metadata, "title")[0]?.textContent,
  ).slice(0, MAX_IMPORT_TITLE_CHARACTERS);
  const author = normalizeDisplayText(
    elementsByLocalName(metadata, "creator")[0]?.textContent,
  ).slice(0, MAX_IMPORT_TITLE_CHARACTERS);

  return {
    author: author || null,
    title: title || null,
  };
}

async function extractEpubSpineText(
  archive: ArchiveContext,
  packagePath: string,
): Promise<ExtractedImportSource> {
  const packageDocument = parseXmlDocument(await archive.readText(packagePath));
  if (packageDocument.documentElement.localName.toLowerCase() !== "package") {
    failEpub(EPUB_STRUCTURE_ERROR);
  }

  const manifest = readPackageManifest(packageDocument, packagePath);
  const spine = elementsByLocalName(packageDocument, "spine")[0];
  if (!spine) {
    failEpub(EPUB_STRUCTURE_ERROR);
  }

  const spineItems: ManifestItem[] = [];
  const seenSpineIds = new Set<string>();
  for (const itemReference of elementsByLocalName(spine, "itemref")) {
    if ((itemReference.getAttribute("linear") ?? "yes").toLowerCase() === "no") {
      continue;
    }

    const id = itemReference.getAttribute("idref")?.trim() ?? "";
    const item = manifest.get(id);
    if (!id || !item || seenSpineIds.has(id)) {
      failEpub(EPUB_STRUCTURE_ERROR);
    }

    if (item.mediaType !== "application/xhtml+xml") {
      failEpub(EPUB_STRUCTURE_ERROR);
    }

    if (!archive.entriesByPath.has(normalizePathKey(item.path))) {
      failEpub(EPUB_STRUCTURE_ERROR);
    }

    seenSpineIds.add(id);
    spineItems.push(item);
  }

  if (spineItems.length === 0) {
    failEpub(EPUB_STRUCTURE_ERROR);
  }

  if (spineItems.length > MAX_IMPORT_CHAPTERS) {
    failEpub(
      "This book has more than 300 chapters. Split it into smaller books before continuing.",
    );
  }

  const navigationTitles = await readNavigationTitles(
    archive,
    manifest,
    spine,
  );
  const sections: string[] = [];
  let extractedCharacters = 0;

  for (const item of spineItems) {
    const chapterDocument = parseXmlDocument(await archive.readText(item.path));
    const body = extractReadableDocumentText(chapterDocument);
    if (!body) {
      continue;
    }

    const chapterNumber = sections.length + 1;
    const title =
      navigationTitles.get(normalizePathKey(item.path)) ??
      findDocumentTitle(chapterDocument);
    const heading = title
      ? `Chapter ${chapterNumber}: ${title}`
      : `Chapter ${chapterNumber}`;
    const section = `${heading}\n${body}`;

    extractedCharacters += section.length + (sections.length > 0 ? 2 : 0);
    if (extractedCharacters > MAX_EXTRACTED_TEXT_CHARACTERS) {
      failEpub(
        "This book is longer than 1,000,000 characters. Shorten it before continuing.",
      );
    }

    sections.push(section);
  }

  const text = sections.join("\n\n");
  const textError = getImportedTextValidationError(text);
  if (textError) {
    failEpub(textError);
  }

  return {
    ...readPackageMetadata(packageDocument),
    text,
  };
}

async function extractEpubText(file: File): Promise<ExtractedImportSource> {
  const fileError = getEpubImportFileValidationError(file);
  if (fileError) {
    throw new Error(fileError);
  }

  const reader = new ZipReader(new BlobReader(file), {
    strictness: "strict",
    useWebWorkers: false,
  });

  try {
    const entries = await reader.getEntries({ strictness: "strict" });
    const archive = createArchiveContext(entries);
    const mimetype = await archive.readText("mimetype");
    if (mimetype !== EPUB_MIMETYPE) {
      failEpub(EPUB_STRUCTURE_ERROR);
    }

    const containerDocument = parseXmlDocument(
      await archive.readText("META-INF/container.xml"),
    );
    const rootfiles = elementsByLocalName(containerDocument, "rootfile");
    const rootfile =
      rootfiles.find(
        (element) =>
          element.getAttribute("media-type")?.trim().toLowerCase() ===
          "application/oebps-package+xml",
      ) ?? rootfiles[0];
    const packageReference = rootfile?.getAttribute("full-path");
    if (!packageReference) {
      failEpub(EPUB_STRUCTURE_ERROR);
    }

    const packagePath = normalizeRootReference(packageReference);
    if (!archive.entriesByPath.has(normalizePathKey(packagePath))) {
      failEpub(EPUB_STRUCTURE_ERROR);
    }

    return await extractEpubSpineText(archive, packagePath);
  } catch (error) {
    if (error instanceof EpubImportError) {
      throw error;
    }

    throw new Error(EPUB_GENERIC_ERROR);
  } finally {
    await reader.close().catch(() => undefined);
  }
}

async function extractTxtText(file: File): Promise<ExtractedImportSource> {
  const fileError = getTextImportFileValidationError(file);
  if (fileError) {
    throw new Error(fileError);
  }

  const text = await file.text();
  const textError = getImportedTextValidationError(text);

  if (textError) {
    throw new Error(textError);
  }

  return {
    author: null,
    text: text.trim(),
    title: null,
  };
}

export async function extractImportSource(
  file: File,
): Promise<ExtractedImportSource> {
  if (isSupportedTextImportExtension(file.name)) {
    return extractTxtText(file);
  }

  if (isSupportedEpubImportExtension(file.name)) {
    return extractEpubText(file);
  }

  throw new Error("Choose a TXT or DRM-free EPUB file.");
}

export async function extractImportText(file: File): Promise<string> {
  return (await extractImportSource(file)).text;
}
