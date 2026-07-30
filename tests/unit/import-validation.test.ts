import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  MAX_EPUB_ARCHIVE_ENTRIES,
  MAX_EPUB_COMPRESSION_RATIO,
  MAX_EPUB_PATH_DEPTH,
  MAX_EPUB_TOTAL_EXPANDED_BYTES,
  extractImportSource,
  extractImportText,
} from "@/lib/import/extract-text";
import {
  MAX_EPUB_IMPORT_BYTES,
  MAX_EXTRACTED_TEXT_CHARACTERS,
  MAX_IMPORT_CHAPTERS,
  MAX_IMPORT_TITLE_CHARACTERS,
  MAX_TXT_IMPORT_BYTES,
  getEpubImportFileValidationError,
  getImportDraftValidationError,
  getTextImportFileValidationError,
  isSupportedEpubImportExtension,
  isSupportedImportExtension,
  isSupportedTextImportExtension,
} from "@/lib/validation/import-validation";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html?: string) => { window: { DOMParser: typeof DOMParser } };
};

beforeAll(() => {
  vi.stubGlobal("DOMParser", new JSDOM("").window.DOMParser);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

interface EpubFixtureEntry {
  level?: number;
  name: string;
  password?: string;
  text: string;
}

interface EpubFixtureOptions {
  chapterEntries?: EpubFixtureEntry[];
  containerXml?: string;
  extraEntries?: EpubFixtureEntry[];
  fileName?: string;
  mimeType?: string;
  packagePath?: string;
  packageXml?: string;
}

const defaultPackagePath = "OEBPS/content.opf";
const defaultChapterPath = "OEBPS/Text/chapter.xhtml";

function createContainerXml(packagePath: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="${packagePath}" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`;
}

function createDefaultPackageXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata />
  <manifest>
    <item id="chapter" href="Text/chapter.xhtml" media-type="application/xhtml+xml" />
  </manifest>
  <spine>
    <itemref idref="chapter" />
  </spine>
</package>`;
}

function createChapterXhtml(title = "Opening", body = "A readable chapter.") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>${title}</title></head>
  <body><h1>${title}</h1><p>${body}</p></body>
</html>`;
}

function asNamedFile(blob: Blob, name: string): File {
  Object.defineProperty(blob, "name", { configurable: true, value: name });
  Object.defineProperty(blob, "lastModified", { configurable: true, value: 0 });
  return blob as File;
}

async function createEpubFixture({
  chapterEntries = [
    {
      name: defaultChapterPath,
      text: createChapterXhtml(),
    },
  ],
  containerXml,
  extraEntries = [],
  fileName = "book.epub",
  mimeType = "application/epub+zip",
  packagePath = defaultPackagePath,
  packageXml = createDefaultPackageXml(),
}: EpubFixtureOptions = {}): Promise<File> {
  const writer = new ZipWriter(new BlobWriter(mimeType), {
    useWebWorkers: false,
  });

  await writer.add("mimetype", new TextReader("application/epub+zip"), {
    level: 0,
  });
  await writer.add(
    "META-INF/container.xml",
    new TextReader(containerXml ?? createContainerXml(packagePath)),
  );
  await writer.add(packagePath, new TextReader(packageXml));

  for (const entry of [...chapterEntries, ...extraEntries]) {
    await writer.add(entry.name, new TextReader(entry.text), {
      level: entry.level,
      password: entry.password,
      useWebWorkers: false,
    });
  }

  return asNamedFile(await writer.close(), fileName);
}

function readEntryName(
  bytes: Uint8Array,
  offset: number,
  nameOffset: number,
  nameLength: number,
) {
  return new TextDecoder().decode(
    bytes.subarray(offset + nameOffset, offset + nameOffset + nameLength),
  );
}

async function replaceDeclaredUncompressedSize(
  file: File,
  entryName: string,
  size: number,
): Promise<File> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let replacements = 0;

  for (let offset = 0; offset <= bytes.length - 4; offset += 1) {
    const signature = view.getUint32(offset, true);

    if (signature === 0x04034b50 && offset + 30 <= bytes.length) {
      const nameLength = view.getUint16(offset + 26, true);
      if (readEntryName(bytes, offset, 30, nameLength) === entryName) {
        view.setUint32(offset + 22, size, true);
        replacements += 1;
      }
    }

    if (signature === 0x02014b50 && offset + 46 <= bytes.length) {
      const nameLength = view.getUint16(offset + 28, true);
      if (readEntryName(bytes, offset, 46, nameLength) === entryName) {
        view.setUint32(offset + 24, size, true);
        replacements += 1;
      }
    }
  }

  if (replacements === 0) {
    throw new Error(`Unable to patch fixture entry ${entryName}.`);
  }

  return asNamedFile(new Blob([bytes], { type: file.type }), file.name);
}

function createTextFileStub({
  name = "book.txt",
  size = 12,
  text = "Chapter 1\nA readable book.",
  type = "text/plain",
}: {
  name?: string;
  size?: number;
  text?: string;
  type?: string;
} = {}) {
  const readText = vi.fn().mockResolvedValue(text);
  return {
    file: { name, size, text: readText, type } as unknown as File,
    readText,
  };
}

function validateDraft({
  chapterCount = 1,
  text = "a",
  title = "Book",
}: {
  chapterCount?: number;
  text?: string;
  title?: string;
} = {}) {
  return getImportDraftValidationError({ chapterCount, text, title });
}

describe("implemented import formats", () => {
  it("accepts TXT and EPUB case-insensitively and rejects out-of-scope formats", () => {
    expect(isSupportedImportExtension("chapter.txt")).toBe(true);
    expect(isSupportedImportExtension("chapter.TXT")).toBe(true);
    expect(isSupportedImportExtension("book.epub")).toBe(true);
    expect(isSupportedImportExtension("book.EPUB")).toBe(true);

    for (const filename of [
      "notes.pdf",
      "draft.docx",
      "story.mp3",
      "memo.m4b",
      "archive.zip",
      "book",
    ]) {
      expect(isSupportedImportExtension(filename)).toBe(false);
    }
  });

  it("requires a real TXT extension", () => {
    expect(isSupportedTextImportExtension("book.txt")).toBe(true);
    expect(isSupportedTextImportExtension("book.txt.exe")).toBe(false);
    expect(isSupportedTextImportExtension("book.")).toBe(false);
    expect(isSupportedTextImportExtension("book")).toBe(false);
  });

  it("requires a real EPUB extension", () => {
    expect(isSupportedEpubImportExtension("book.epub")).toBe(true);
    expect(isSupportedEpubImportExtension("book.EPUB")).toBe(true);
    expect(isSupportedEpubImportExtension("book.epub.exe")).toBe(false);
    expect(isSupportedEpubImportExtension("book")).toBe(false);
  });

  it("accepts text/plain or an absent MIME and rejects explicit MIME mismatches", () => {
    expect(
      getTextImportFileValidationError({
        name: "book.TXT",
        size: 1,
        type: "TEXT/PLAIN",
      }),
    ).toBeNull();
    expect(
      getTextImportFileValidationError({ name: "book.txt", size: 1, type: "" }),
    ).toBeNull();
    expect(
      getTextImportFileValidationError({
        name: "book.txt",
        size: 1,
        type: "application/pdf",
      }),
    ).toMatch(/not identified as plain text/i);
    expect(
      getTextImportFileValidationError({
        name: "book.pdf",
        size: 1,
        type: "text/plain",
      }),
    ).toMatch(/choose a plain-text TXT file/i);
  });

  it("accepts EPUB MIME variants or an absent MIME and rejects explicit mismatches", () => {
    for (const type of [
      "application/epub+zip",
      "application/zip",
      "application/x-zip-compressed",
      "application/octet-stream",
      "",
    ]) {
      expect(
        getEpubImportFileValidationError({ name: "book.EPUB", size: 1, type }),
      ).toBeNull();
    }

    expect(
      getEpubImportFileValidationError({
        name: "book.epub",
        size: 1,
        type: "text/plain",
      }),
    ).toMatch(/not identified as an EPUB/i);
  });
});

describe("TXT byte boundaries", () => {
  it("accepts one byte below and exactly at 5 MB", async () => {
    for (const size of [MAX_TXT_IMPORT_BYTES - 1, MAX_TXT_IMPORT_BYTES]) {
      const { file } = createTextFileStub({ size });
      await expect(extractImportText(file)).resolves.toBe(
        "Chapter 1\nA readable book.",
      );
    }
  });

  it("rejects one byte above 5 MB before reading file contents", async () => {
    const { file, readText } = createTextFileStub({
      size: MAX_TXT_IMPORT_BYTES + 1,
    });

    await expect(extractImportText(file)).rejects.toThrow(/larger than 5 MB/i);
    expect(readText).not.toHaveBeenCalled();
  });
});

describe("EPUB compressed byte boundaries", () => {
  it("accepts one byte below and exactly at 25 MB", () => {
    for (const size of [MAX_EPUB_IMPORT_BYTES - 1, MAX_EPUB_IMPORT_BYTES]) {
      expect(
        getEpubImportFileValidationError({
          name: "book.epub",
          size,
          type: "application/epub+zip",
        }),
      ).toBeNull();
    }
  });

  it("rejects one byte above 25 MB before opening the archive", async () => {
    const file = {
      name: "book.epub",
      size: MAX_EPUB_IMPORT_BYTES + 1,
      type: "application/epub+zip",
    } as File;

    await expect(extractImportText(file)).rejects.toThrow(/larger than 25 MB/i);
  });
});

describe("bounded EPUB extraction", () => {
  it("returns the package title and author for the import review", async () => {
    const file = await createEpubFixture({
      packageXml: `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="3.0">
  <metadata>
    <dc:title>  Storm   Harbor  </dc:title>
    <dc:creator> Rowan   Vale </dc:creator>
  </metadata>
  <manifest>
    <item id="chapter" href="Text/chapter.xhtml" media-type="application/xhtml+xml" />
  </manifest>
  <spine><itemref idref="chapter" /></spine>
</package>`,
    });

    await expect(extractImportSource(file)).resolves.toMatchObject({
      author: "Rowan Vale",
      title: "Storm Harbor",
      text: expect.stringContaining("A readable chapter."),
    });
  });

  it("extracts spine order, navigation titles, and decoded entities without metadata", async () => {
    const packageXml = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata />
  <manifest>
    <item id="second" href="Text/second.xhtml" media-type="application/xhtml+xml" />
    <item id="first" href="Text/first.xhtml" media-type="application/xhtml+xml" />
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
  </manifest>
  <spine>
    <itemref idref="first" />
    <itemref idref="second" />
  </spine>
</package>`;
    const file = await createEpubFixture({
      packageXml,
      chapterEntries: [
        {
          name: "OEBPS/Text/second.xhtml",
          text: createChapterXhtml("Document", "Goodbye &#x2014; for now."),
        },
        {
          name: "OEBPS/Text/first.xhtml",
          text: createChapterXhtml("Document", "Welcome &amp; stay awhile."),
        },
      ],
      extraEntries: [
        {
          name: "OEBPS/nav.xhtml",
          text: `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Contents</title></head>
  <body><nav epub:type="toc"><ol>
    <li><a href="Text/first.xhtml">Opening &amp; Arrival</a></li>
    <li><a href="Text/second.xhtml">The Last Stop</a></li>
  </ol></nav></body>
</html>`,
        },
      ],
    });

    const text = await extractImportText(file);

    expect(text).toContain("Chapter 1: Opening & Arrival");
    expect(text).toContain("Welcome & stay awhile.");
    expect(text).toContain("Chapter 2: The Last Stop");
    expect(text).toContain("Goodbye — for now.");
    expect(text.indexOf("Opening & Arrival")).toBeLessThan(
      text.indexOf("The Last Stop"),
    );
  });

  it("rejects malformed container and package XML with a non-technical error", async () => {
    const malformedContainer = await createEpubFixture({
      containerXml: "<container><rootfiles>",
    });
    const malformedPackage = await createEpubFixture({
      packageXml: "<package><manifest></package>",
    });

    await expect(extractImportText(malformedContainer)).rejects.toThrow(
      /could not be read safely|damaged/i,
    );
    await expect(extractImportText(malformedPackage)).rejects.toThrow(
      /could not be read safely|damaged/i,
    );
  });

  it("rejects encrypted entries and EPUB DRM marker files", async () => {
    const encrypted = await createEpubFixture({
      chapterEntries: [
        {
          name: defaultChapterPath,
          password: "fixture-password",
          text: createChapterXhtml(),
        },
      ],
    });
    const drmMarked = await createEpubFixture({
      extraEntries: [
        {
          name: "META-INF/encryption.xml",
          text: "<encryption />",
        },
      ],
    });

    await expect(extractImportText(encrypted)).rejects.toThrow(
      /encrypted|DRM-protected/i,
    );
    await expect(extractImportText(drmMarked)).rejects.toThrow(
      /encrypted|DRM-protected/i,
    );
  });

  it("rejects traversal references, duplicate normalized names, and deep paths", async () => {
    const traversal = await createEpubFixture({
      packagePath: "OPS/content.opf",
      packageXml: `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata />
  <manifest><item id="chapter" href="../outside.xhtml" media-type="application/xhtml+xml" /></manifest>
  <spine><itemref idref="chapter" /></spine>
</package>`,
      chapterEntries: [
        { name: "outside.xhtml", text: createChapterXhtml() },
      ],
    });
    const duplicate = await createEpubFixture({
      extraEntries: [
        { name: "OEBPS/Text/CHAPTER.xhtml", text: createChapterXhtml() },
      ],
    });
    const deepPath = Array.from(
      { length: MAX_EPUB_PATH_DEPTH + 1 },
      (_, index) => `level-${index}`,
    ).join("/");
    const deeplyNested = await createEpubFixture({
      extraEntries: [{ name: `${deepPath}/file.txt`, text: "safe-looking" }],
    });

    for (const unsafeFile of [traversal, duplicate, deeplyNested]) {
      await expect(extractImportText(unsafeFile)).rejects.toThrow(
        /unsafe file layout|could not be read safely/i,
      );
    }
  });

  it("rejects excessive compression ratios", async () => {
    const file = await createEpubFixture({
      extraEntries: [
        {
          level: 9,
          name: "OEBPS/Assets/repeated.txt",
          text: "x".repeat(
            Math.max(250_000, MAX_EPUB_COMPRESSION_RATIO * 2_000),
          ),
        },
      ],
    });

    await expect(extractImportText(file)).rejects.toThrow(
      /expands beyond|safety limits/i,
    );
  });

  it("rejects excessive entry counts", async () => {
    const extraEntries = Array.from(
      { length: MAX_EPUB_ARCHIVE_ENTRIES - 3 },
      (_, index): EpubFixtureEntry => ({
        name: `OEBPS/Assets/empty-${index}.txt`,
        text: "",
      }),
    );
    const file = await createEpubFixture({ extraEntries });

    await expect(extractImportText(file)).rejects.toThrow(/too many files/i);
  });

  it("rejects archives whose declared total expanded bytes exceed the limit", async () => {
    const entryName = "OEBPS/Assets/declared-large.bin";
    const file = await createEpubFixture({
      extraEntries: [{ name: entryName, text: "x", level: 0 }],
    });
    const patchedFile = await replaceDeclaredUncompressedSize(
      file,
      entryName,
      MAX_EPUB_TOTAL_EXPANDED_BYTES,
    );

    await expect(extractImportText(patchedFile)).rejects.toThrow(
      /expands beyond|safety limits/i,
    );
  });
});

describe("extracted text boundaries", () => {
  it("accepts one character below and exactly at the limit", () => {
    const atLimit = "a".repeat(MAX_EXTRACTED_TEXT_CHARACTERS);
    expect(validateDraft({ text: atLimit.slice(1) })).toBeNull();
    expect(validateDraft({ text: atLimit })).toBeNull();
  });

  it("rejects one character above the limit and whitespace-only text", () => {
    expect(
      validateDraft({ text: "a".repeat(MAX_EXTRACTED_TEXT_CHARACTERS + 1) }),
    ).toMatch(/longer than 1,000,000 characters/i);
    expect(validateDraft({ text: " \n\t " })).toMatch(/add book text/i);
  });
});

describe("title and chapter boundaries", () => {
  it("accepts titles one character below and exactly at the limit", () => {
    expect(validateDraft({ title: "t".repeat(MAX_IMPORT_TITLE_CHARACTERS - 1) })).toBeNull();
    expect(validateDraft({ title: "t".repeat(MAX_IMPORT_TITLE_CHARACTERS) })).toBeNull();
  });

  it("rejects a title one character above the limit", () => {
    expect(
      validateDraft({ title: "t".repeat(MAX_IMPORT_TITLE_CHARACTERS + 1) }),
    ).toMatch(/200 characters or fewer/i);
  });

  it("accepts chapter counts one below and exactly at the limit", () => {
    expect(validateDraft({ chapterCount: MAX_IMPORT_CHAPTERS - 1 })).toBeNull();
    expect(validateDraft({ chapterCount: MAX_IMPORT_CHAPTERS })).toBeNull();
  });

  it("rejects one chapter above the limit and unreasonable counts", () => {
    expect(validateDraft({ chapterCount: MAX_IMPORT_CHAPTERS + 1 })).toMatch(
      /more than 300 chapters/i,
    );
    expect(validateDraft({ chapterCount: 0 })).toMatch(/no readable chapters/i);
    expect(validateDraft({ chapterCount: 1.5 })).toMatch(/no readable chapters/i);
  });
});
