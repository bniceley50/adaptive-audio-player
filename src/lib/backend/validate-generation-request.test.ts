import { describe, expect, it } from "vitest";

import {
  COMPATIBILITY_NARRATION_MODE,
  validateGenerationRequest,
  type ValidateGenerationRequestInput,
} from "@/lib/backend/validate-generation-request";
import {
  MAX_EXTRACTED_TEXT_CHARACTERS,
  MAX_IMPORT_CHAPTERS,
} from "@/lib/validation/import-validation";
import { VOICE_CATALOG } from "@/lib/voices/catalog";

const privateManuscript = "A private manuscript that must never appear in an error.";

function validInput(): ValidateGenerationRequestInput {
  return {
    workspaceId: "workspace-1",
    bookId: "book-1",
    kind: "sample-generation",
    narratorId: "marlowe",
    mode: COMPATIBILITY_NARRATION_MODE,
    book: {
      workspaceId: "workspace-1",
      bookId: "book-1",
      chapterCount: 1,
      text: privateManuscript,
    },
    existingJobs: [],
  };
}

function validate(overrides: Partial<ValidateGenerationRequestInput> = {}) {
  return validateGenerationRequest({ ...validInput(), ...overrides });
}

describe("generation voice catalog", () => {
  it("validates every narrator against its server-owned engine", () => {
    expect(
      VOICE_CATALOG.map(({ displayName, engineVoiceId, id }) => ({
        displayName,
        engineVoiceId,
        id,
      })),
    ).toEqual([
      { displayName: "Marlowe", engineVoiceId: "af_heart", id: "marlowe" },
      { displayName: "Sloane", engineVoiceId: "af_bella", id: "sloane" },
      { displayName: "Jules", engineVoiceId: "am_michael", id: "jules" },
      {
        displayName: "High Quality Narrator",
        engineVoiceId: "chatterbox-default",
        id: "chatterbox-default",
      },
    ]);

    for (const voice of VOICE_CATALOG) {
      expect(
        validate({
          engineId: voice.narrationEngineId,
          narratorId: voice.id,
        }),
      ).toMatchObject({
        ok: true,
        value: {
          engineId: voice.narrationEngineId,
          narratorId: voice.id,
        },
      });
    }
  });
});

describe("validateGenerationRequest", () => {
  it("returns normalized, enqueue-safe metadata without returning manuscript text", () => {
    const result = validate({
      workspaceId: " WORKSPACE-1 ",
      bookId: " BOOK-1 ",
      narratorId: " SLOANE ",
      mode: " CLASSIC ",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        workspaceId: "workspace-1",
        bookId: "book-1",
        kind: "sample-generation",
        narratorId: "sloane",
        engineId: "kokoro",
        mode: "classic",
        chapterCount: 1,
      },
    });
    expect(JSON.stringify(result)).not.toContain(privateManuscript);
  });

  it.each([
    ["missing book", { book: null }, "book-not-found"],
    [
      "wrong workspace",
      {
        book: {
          ...validInput().book!,
          workspaceId: "workspace-2",
        },
      },
      "book-access-denied",
    ],
    ["unsupported voice", { narratorId: "uploaded-clone" }, "unsupported-voice"],
    ["inherited object key as a voice", { narratorId: "constructor" }, "unsupported-voice"],
    ["non-narration mode", { mode: "immersive" }, "unsupported-mode"],
    ["missing mode", { mode: undefined }, "unsupported-mode"],
    ["unknown job kind", { kind: "sync" }, "invalid-request"],
    ["unsafe book id", { bookId: "../book-1" }, "invalid-request"],
    ["mismatched book", { bookId: "book-2" }, "book-not-found"],
  ] as const)("rejects %s", (_label, overrides, expectedCode) => {
    const result = validate(overrides);

    expect(result).toMatchObject({ ok: false, error: { code: expectedCode } });
  });

  it.each([
    [0, "invalid-chapter-count"],
    [-1, "invalid-chapter-count"],
    [1.5, "invalid-chapter-count"],
    [MAX_IMPORT_CHAPTERS + 1, "invalid-chapter-count"],
    [Number.NaN, "invalid-chapter-count"],
  ] as const)("rejects stored chapter count %s", (chapterCount, expectedCode) => {
    const result = validate({
      book: { ...validInput().book!, chapterCount },
    });

    expect(result).toMatchObject({ ok: false, error: { code: expectedCode } });
  });

  it.each([
    ["", "invalid-book-text"],
    ["   \n\t", "invalid-book-text"],
    ["a".repeat(MAX_EXTRACTED_TEXT_CHARACTERS + 1), "book-text-too-long"],
  ] as const)("rejects invalid stored manuscript text", (text, expectedCode) => {
    const result = validate({
      book: { ...validInput().book!, text },
    });

    expect(result).toMatchObject({ ok: false, error: { code: expectedCode } });
  });

  it("accepts the exact stored chapter and text limits", () => {
    const result = validate({
      book: {
        ...validInput().book!,
        chapterCount: MAX_IMPORT_CHAPTERS,
        text: "a".repeat(MAX_EXTRACTED_TEXT_CHARACTERS),
      },
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        chapterCount: MAX_IMPORT_CHAPTERS,
      },
    });
  });

  it.each(["queued", "running"] as const)(
    "rejects a %s job already active for the same book and kind",
    (status) => {
      const result = validate({
        existingJobs: [
          {
            workspaceId: "workspace-1",
            bookId: "book-1",
            kind: "sample-generation",
            status,
          },
        ],
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: "duplicate-active-job" },
      });
    },
  );

  it("does not treat completed or different-kind jobs as duplicates", () => {
    const result = validate({
      existingJobs: [
        {
          workspaceId: "workspace-1",
          bookId: "book-1",
          kind: "sample-generation",
          status: "completed",
        },
        {
          workspaceId: "workspace-1",
          bookId: "book-1",
          kind: "full-book-generation",
          status: "running",
        },
      ],
    });

    expect(result).toMatchObject({ ok: true });
  });

  it("returns safe errors without manuscript, filesystem, or rejected input detail", () => {
    const rawPath = "C:\\Users\\listener\\private-book.txt";
    const result = validate({
      narratorId: rawPath,
      book: {
        ...validInput().book!,
        text: `${privateManuscript} ${rawPath}`,
      },
    });
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({ ok: false });
    expect(serialized).not.toContain(privateManuscript);
    expect(serialized).not.toContain(rawPath);
    expect(serialized).not.toContain("workspace-1");
    expect(serialized).not.toContain("book-1");
  });
});
