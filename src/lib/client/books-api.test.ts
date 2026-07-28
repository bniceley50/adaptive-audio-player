import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BooksApiError,
  cacheBookMetadata,
  createBook,
  createBookIdempotencyKey,
  deleteBook,
  getBook,
  listBooks,
} from "@/lib/client/books-api";

const manuscript = "Chapter 1\nThe private manuscript stays out of logs and cache.";
const createdBook = {
  bookId: "book-7d606e85-7f01-43aa-b179-a73db36011ad",
  title: "Private Harbor",
  chapterCount: 1,
  updatedAt: "2026-07-19T12:00:00.000Z",
};
const listedBook = {
  ...createdBook,
  activity: {
    jobs: [],
    outputs: [],
    progress: null,
  },
};
const loadedBook = {
  ...createdBook,
  manuscript,
  chapters: [
    {
      id: "chapter-1",
      title: "Chapter 1",
      text: "The private manuscript stays out of logs and cache.",
      order: 0,
    },
  ],
};

function successResponse(replayed = false) {
  return new Response(
    JSON.stringify({ ok: true, replayed, book: createdBook }),
    {
      status: replayed ? 200 : 201,
      headers: { "content-type": "application/json" },
    },
  );
}

function createMemoryStorage(initialBooks: unknown[] = []) {
  const values = new Map<string, string>([
    ["adaptive-audio-player.library.books", JSON.stringify(initialBooks)],
  ]);

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("books API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends one shaped create request and caches only returned metadata", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async () => successResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await createBook({
      title: "Private Harbor",
      text: manuscript,
      idempotencyKey: " Import-7D606E85 ",
      signal: controller.signal,
    });

    expect(result).toEqual({ book: createdBook, replayed: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/books");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      signal: controller.signal,
    });
    expect(JSON.parse(String(init.body))).toEqual({
      title: "Private Harbor",
      text: manuscript,
    });
    const headers = new Headers(init.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("idempotency-key")).toBe("import-7d606e85");

    const storage = createMemoryStorage([
      {
        bookId: "book-existing",
        title: "Existing Book",
        chapterCount: 2,
        updatedAt: "2026-07-18T12:00:00.000Z",
      },
    ]);
    cacheBookMetadata(result.book, storage);
    const cached = storage.getItem("adaptive-audio-player.library.books") ?? "";
    expect(JSON.parse(cached)).toEqual([
      createdBook,
      expect.objectContaining({ bookId: "book-existing" }),
    ]);
    expect(cached).not.toContain(manuscript);
    expect(cached).not.toContain("manuscript");
    expect(cached).not.toContain("text");
  });

  it("passes aborts through unchanged", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("Aborted", "AbortError");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        expect(init?.signal).toBe(controller.signal);
        throw abortError;
      }),
    );

    const request = createBook({
      title: "Private Harbor",
      text: manuscript,
      idempotencyKey: "import-abort-1",
      signal: controller.signal,
    });
    controller.abort();

    await expect(request).rejects.toBe(abortError);
  });

  it.each([
    {
      status: 400,
      expected:
        "The book could not be saved because the import is invalid. Review it and try again.",
      retryable: false,
    },
    {
      status: 403,
      expected:
        "The local library could not authorize this import. Reload and try again.",
      retryable: true,
    },
    {
      status: 409,
      expected:
        "This import conflicts with an earlier attempt. Edit the source and try again.",
      retryable: false,
    },
    {
      status: 413,
      expected: "This book is too large to save. Shorten it and try again.",
      retryable: false,
    },
    {
      status: 500,
      expected:
        "The book could not be saved. Your import is still here; try again.",
      retryable: true,
    },
  ])(
    "maps $status responses to a safe plain-language error",
    async ({ status, expected, retryable }) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(JSON.stringify({ error: manuscript }), { status }),
        ),
      );

      const request = createBook({
        title: "Private Harbor",
        text: manuscript,
        idempotencyKey: `import-status-${status}`,
      });

      await expect(request).rejects.toMatchObject({
        name: "BooksApiError",
        message: expected,
        retryable,
        status,
      });
      await expect(request.catch((error) => error.message)).resolves.not.toContain(
        manuscript,
      );
    },
  );

  it("reuses the caller's idempotency key for a safe retry without logging the manuscript", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error(manuscript))
      .mockResolvedValueOnce(successResponse(true));
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      title: "Private Harbor",
      text: manuscript,
      idempotencyKey: "import-retry-1",
    };

    await expect(createBook(input)).rejects.toMatchObject({
      name: "BooksApiError",
      message: "The book could not be saved. Your import is still here; try again.",
      retryable: true,
      status: null,
    });
    await expect(createBook(input)).resolves.toEqual({
      book: createdBook,
      replayed: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requestKeys = fetchMock.mock.calls.map((call) =>
      new Headers((call[1] as RequestInit).headers).get("idempotency-key"),
    );
    expect(requestKeys).toEqual(["import-retry-1", "import-retry-1"]);
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("rejects an invalid key before sending private content", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createBook({
        title: "Private Harbor",
        text: manuscript,
        idempotencyKey: "invalid key with spaces",
      }),
    ).rejects.toEqual(
      new BooksApiError(
        "The import could not be started safely. Edit it and try again.",
        null,
        false,
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a bounded lowercase idempotency key", () => {
    const idempotencyKey = createBookIdempotencyKey();

    expect(idempotencyKey).toMatch(
      /^import-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(idempotencyKey.length).toBeLessThanOrEqual(128);
  });

  it("loads one normalized book through a single private request", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async () =>
      Response.json({ book: loadedBook }, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getBook(` ${createdBook.bookId.toUpperCase()} `, {
        signal: controller.signal,
      }),
    ).resolves.toEqual(loadedBook);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/books/${createdBook.bookId}`,
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
        headers: { accept: "application/json" },
        signal: controller.signal,
      }),
    );
  });

  it("lists bounded activity without accepting manuscript-shaped data", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ books: [listedBook] }, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listBooks()).resolves.toEqual([listedBook]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/books", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      method: "GET",
      signal: undefined,
    });

    fetchMock.mockResolvedValueOnce(
      Response.json({ books: [{ ...listedBook, chapterCount: 0 }] }),
    );
    await expect(listBooks()).rejects.toEqual(
      new BooksApiError(
        "The library returned invalid data. Reload and try again.",
        200,
        true,
      ),
    );

    fetchMock.mockResolvedValueOnce(
      Response.json({
        books: [
          {
            ...listedBook,
            activity: {
              ...listedBook.activity,
              outputs: [
                {
                  artifactId: "artifact-1",
                  artifactUrl: "file:///private/audio.wav",
                  generatedAt: "2026-07-19T12:01:00.000Z",
                  isCurrent: true,
                  jobId: "job-1",
                  kind: "sample-generation",
                },
              ],
            },
          },
        ],
      }),
    );
    await expect(listBooks()).rejects.toBeInstanceOf(BooksApiError);
  });

  it("deletes one normalized book without sending a request body", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async () =>
      Response.json({ ok: true, deleted: true }, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      deleteBook(` ${createdBook.bookId.toUpperCase()} `, {
        signal: controller.signal,
      }),
    ).resolves.toEqual({ deleted: true });
    expect(fetchMock).toHaveBeenCalledWith(`/api/books/${createdBook.bookId}`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      method: "DELETE",
      signal: controller.signal,
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBeUndefined();
  });

  it("maps failed deletion safely and rejects invalid ids before fetch", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: manuscript }, { status: 409 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteBook(createdBook.bookId)).rejects.toEqual(
      new BooksApiError(
        "This book could not be deleted safely. Try again.",
        409,
        true,
      ),
    );
    await expect(deleteBook("../foreign-book")).rejects.toEqual(
      new BooksApiError(
        "This book could not be deleted. Return to the library and try again.",
        null,
        false,
      ),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects an invalid book id before requesting private data", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getBook("../foreign-book")).rejects.toEqual(
      new BooksApiError(
        "This book could not be opened. Return to the library and try again.",
        null,
        false,
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes a book-load abort through unchanged", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw abortError;
      }),
    );

    await expect(
      getBook(createdBook.bookId, { signal: new AbortController().signal }),
    ).rejects.toBe(abortError);
  });

  it.each([
    {
      status: 403,
      expected:
        "The local library could not authorize this book. Reload and try again.",
      retryable: true,
    },
    {
      status: 404,
      expected: "This book is no longer in the local library.",
      retryable: false,
    },
    {
      status: 500,
      expected: "This book could not be loaded. Reload and try again.",
      retryable: true,
    },
  ])(
    "maps a $status book response without exposing its body",
    async ({ status, expected, retryable }) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({ error: manuscript }, { status }),
        ),
      );

      const result = getBook(createdBook.bookId);
      await expect(result).rejects.toMatchObject({
        name: "BooksApiError",
        message: expected,
        retryable,
        status,
      });
      await expect(result.catch((error) => error.message)).resolves.not.toContain(
        manuscript,
      );
    },
  );

  it("rejects a malformed private book DTO without returning partial data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          book: {
            ...loadedBook,
            chapters: [{ ...loadedBook.chapters[0], order: -1 }],
          },
        }),
      ),
    );

    await expect(getBook(createdBook.bookId)).rejects.toEqual(
      new BooksApiError(
        "This book returned invalid data. Reload and try again.",
        200,
        true,
      ),
    );
  });
});
