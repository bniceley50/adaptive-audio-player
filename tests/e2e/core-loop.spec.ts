import { expect, test, type Page, type Route } from "@playwright/test";

import { generateMockWav } from "../../src/lib/backend/mock-audio";

const bookTitle = "Storm Harbor";
const generatedAt = "2026-07-18T12:00:00.000Z";
const sampleJobId = "e2e-sample-job";
const sampleAudio = generateMockWav(
  "A deterministic generated sample for the core listening browser test.",
);

interface CapturedProgressRequest {
  artifactId: string;
  chapterIndex: number | null;
  durationSeconds: number;
  positionSeconds: number;
  revision: number;
  speed: number;
}

async function fulfillJson(route: Route, payload: unknown) {
  await route.fulfill({
    body: JSON.stringify(payload),
    contentType: "application/json",
    status: 200,
  });
}

async function fulfillSampleAudio(route: Route) {
  const rangeHeader = route.request().headers().range;
  const rangeMatch = rangeHeader?.match(/^bytes=(\d+)-(\d*)$/);
  const start = rangeMatch ? Number(rangeMatch[1]) : 0;
  const requestedEnd = rangeMatch?.[2] ? Number(rangeMatch[2]) : null;
  const end = Math.min(
    requestedEnd ?? sampleAudio.length - 1,
    sampleAudio.length - 1,
  );

  if (rangeHeader && (!rangeMatch || start > end || start >= sampleAudio.length)) {
    await route.fulfill({
      headers: {
        "accept-ranges": "bytes",
        "content-range": `bytes */${sampleAudio.length}`,
      },
      status: 416,
    });
    return;
  }

  const body = sampleAudio.subarray(start, end + 1);
  await route.fulfill({
    body,
    contentType: "audio/wav",
    headers: {
      "accept-ranges": "bytes",
      "cache-control": "no-store",
      "content-length": String(body.length),
      ...(rangeHeader
        ? { "content-range": `bytes ${start}-${end}/${sampleAudio.length}` }
        : {}),
    },
    status: rangeHeader ? 206 : 200,
  });
}

async function installDeterministicGeneration(page: Page) {
  let bookId = "e2e-unassigned-book";
  let narratorId = "marlowe";
  const mode = "classic";
  let sampleRequested = false;
  let sampleReady = false;
  let pollCount = 0;
  let progressRevision = 0;
  let serverProgress: (CapturedProgressRequest & {
    bookId: string;
    updatedAt: string;
  }) | null = null;
  const mutationRequests: string[] = [];
  const progressRequests: CapturedProgressRequest[] = [];
  const legacySyncRequests: string[] = [];

  function sampleJob(status: "queued" | "running" | "completed") {
    return {
      id: sampleJobId,
      workspaceId: "e2e-workspace",
      kind: "sample-generation",
      status,
      bookId,
      narratorId,
      mode,
      errorMessage: null,
      createdAt: generatedAt,
      updatedAt: generatedAt,
      startedAt: status === "queued" ? null : generatedAt,
      completedAt: status === "completed" ? generatedAt : null,
      progress: {
        totalChapters: 1,
        completedChapters: status === "completed" ? 1 : 0,
        currentChapterIndex: status === "running" ? 0 : null,
        currentChapterTitle: status === "running" ? "Chapter 1" : null,
      },
    };
  }

  function sampleOutput() {
    return {
      artifactId: "e2e-current-sample",
      artifactUrl: `/api/audio/generated/${bookId}?kind=sample-generation`,
      bookId,
      kind: "sample-generation",
      narratorId,
      mode,
      chapterCount: 1,
      mimeType: "audio/wav",
      provider: "mock",
      generatedAt,
      jobId: sampleJobId,
      chapterIndex: null,
      chapterTitle: null,
      chapterArtifacts: [],
      isChapterArtifact: false,
      isCurrent: true,
    };
  }

  await page.route("**/api/sync/library", async (route) => {
    legacySyncRequests.push(
      `${route.request().method()} ${route.request().url()}`,
    );
    await route.abort("blockedbyclient");
  });

  await page.route("**/api/voices/*/preview", fulfillSampleAudio);

  await page.route("**/api/jobs/book/**", async (route) => {
    await fulfillJson(route, {
      artifacts: [],
      jobs: sampleRequested
        ? [sampleJob(sampleReady ? "completed" : "running")]
        : [],
      outputs: sampleReady ? [sampleOutput()] : [],
    });
  });

  await page.route(`**/api/jobs/sample-generation/${sampleJobId}`, async (route) => {
    pollCount += 1;
    sampleReady = pollCount >= 2;
    await fulfillJson(route, {
      job: sampleJob(sampleReady ? "completed" : "running"),
    });
  });

  await page.route("**/api/jobs/sample-generation", async (route) => {
    mutationRequests.push(route.request().url());
    const request = (await route.request().postDataJSON()) as {
      bookId: string;
      narratorId: string;
    };

    bookId = request.bookId;
    narratorId = request.narratorId;
    sampleRequested = true;
    await fulfillJson(route, { ok: true, job: sampleJob("queued") });
  });

  await page.route("**/api/books/*/progress", async (route) => {
    if (route.request().method() === "GET") {
      await fulfillJson(route, { progress: serverProgress });
      return;
    }

    const request =
      (await route.request().postDataJSON()) as CapturedProgressRequest;
    progressRequests.push(request);
    progressRevision += 1;
    serverProgress = {
      ...request,
      bookId,
      revision: progressRevision,
      updatedAt: new Date(Date.parse(generatedAt) + progressRevision).toISOString(),
    };
    await fulfillJson(route, { progress: serverProgress });
  });

  await page.route("**/api/audio/generated/**", fulfillSampleAudio);

  return { legacySyncRequests, mutationRequests, progressRequests };
}

async function readAudioTime(page: Page) {
  return page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentTime);
}

async function waitForPlayableAudio(page: Page) {
  await expect(page.locator("audio")).toBeAttached();
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate((audio: HTMLAudioElement) =>
          Number.isFinite(audio.duration) ? audio.duration : 0,
        ),
    )
    .toBeGreaterThan(1);
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate((audio: HTMLAudioElement) => audio.seekable.length),
    )
    .toBeGreaterThan(0);
}

test("core listening: generated media advances, seeks, resumes, and sleeps", async ({
  page,
}) => {
  test.setTimeout(90_000);

  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  const { legacySyncRequests, mutationRequests, progressRequests } =
    await installDeterministicGeneration(page);

  await page.goto("/");
  await expect(page.locator("body")).toContainText("Your library");
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  await expect(page.getByText("Books: 0", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Add book" }).click();
  await expect(page).toHaveURL(/\/import$/);
  const mutationCountBeforeRejectedImport = mutationRequests.length;
  const databasesBeforeRejectedImport = await page.evaluate(async () =>
    (await indexedDB.databases())
      .map((database) => database.name ?? "")
      .sort(),
  );
  const fileSource = page.getByLabel("Choose a file", { exact: true });
  await fileSource.focus();
  await page.keyboard.press("Space");
  await expect(fileSource).toBeChecked();
  const uploadInput = page.getByLabel("Choose a TXT or EPUB file");
  await expect(uploadInput).toHaveAttribute(
    "accept",
    ".txt,.epub,text/plain,application/epub+zip,application/zip",
  );
  await expect(
    page.getByText(
      "PDF, DOCX, MP3, and M4B are not supported.",
    ),
  ).toBeVisible();
  await uploadInput.setInputFiles({
    buffer: Buffer.from("ID3 rejected original-audio fixture"),
    mimeType: "audio/mpeg",
    name: "original-audio.mp3",
  });
  await expect(
    page
      .getByRole("alert")
      .getByText("Choose a TXT or DRM-free EPUB file.", { exact: true }),
  ).toBeVisible();
  expect(mutationRequests).toHaveLength(mutationCountBeforeRejectedImport);
  expect(
    await page.evaluate(() => ({
      bookCount: JSON.parse(
        window.localStorage.getItem("adaptive-audio-player.library.books") ?? "[]",
      ).length as number,
      draftKeys: Object.keys(window.localStorage).filter((key) =>
        key.startsWith("adaptive-audio-player.library.draft."),
      ),
    })),
  ).toEqual({ bookCount: 0, draftKeys: [] });
  expect(
    await page.evaluate(async () =>
      (await indexedDB.databases())
        .map((database) => database.name ?? "")
        .sort(),
    ),
  ).toEqual(databasesBeforeRejectedImport);
  const pasteSource = page.getByLabel("Paste text", { exact: true });
  await pasteSource.focus();
  await page.keyboard.press("Space");
  await expect(pasteSource).toBeChecked();
  await page.getByLabel("Paste book text").evaluate((textarea) => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(textarea, "a".repeat(1_000_001));
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const reviewButton = page.getByRole("button", { name: "Review book" });
  await expect(reviewButton).toBeEnabled();
  await reviewButton.click();
  await expect(
    page.getByRole("alert").getByText(
      "This book is longer than 1,000,000 characters. Shorten it before continuing.",
    ),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/import$/);
  expect(mutationRequests).toHaveLength(mutationCountBeforeRejectedImport);
  expect(
    await page.evaluate(() => {
      const storedBooks = JSON.parse(
        window.localStorage.getItem("adaptive-audio-player.library.books") ?? "[]",
      ) as unknown[];
      const draftKeys = Object.keys(window.localStorage).filter((key) =>
        key.startsWith("adaptive-audio-player.library.draft."),
      );
      return { bookCount: storedBooks.length, draftKeys };
    }),
  ).toEqual({ bookCount: 0, draftKeys: [] });
  expect(
    await page.evaluate(async () =>
      (await indexedDB.databases())
        .map((database) => database.name ?? "")
        .sort(),
    ),
  ).toEqual(databasesBeforeRejectedImport);
  await page
    .getByLabel("Paste book text")
    .fill("Chapter 1\nThe harbor lights moved across the water.");
  await reviewButton.click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Review your book" }),
  ).toBeVisible();
  await page.getByLabel("Book title").fill(bookTitle);
  await expect(
    page.getByRole("heading", { level: 4, name: "Chapter 1" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add book", exact: true }).click();
  await expect(page).toHaveURL(/\/books\/[^/]+$/);
  const importedBookId = new URL(page.url()).pathname.split("/").at(-1);
  expect(importedBookId).toBeTruthy();

  await page.locator("header").getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Books: 1", { exact: true })).toBeVisible();
  const shelfBook = page.locator(`[data-testid="shelf-book-${importedBookId}"]`);
  await expect(shelfBook).toContainText(bookTitle);
  await expect(shelfBook).toContainText("Voice setup needed");
  await shelfBook.getByRole("link", { name: "Choose a voice" }).click();
  await expect(page).toHaveURL(new RegExp(`/books/${importedBookId}$`));

  const sloaneVoice = page.getByLabel("Sloane", { exact: true });
  await sloaneVoice.focus();
  await page.keyboard.press("Space");
  await expect(sloaneVoice).toBeChecked();
  const sloanePreview = page.getByRole("button", {
    name: "Play Sloane preview",
  });
  await sloanePreview.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Stop Sloane preview" }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(sloanePreview).toBeVisible();
  await page.getByRole("button", { name: "Generate sample", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Listen to sample" }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: "Listen to sample" }).click();
  await expect(page).toHaveURL(/\/player\/[^/]+\?artifact=sample$/);

  await expect(
    page.getByRole("heading", { level: 1, name: bookTitle }),
  ).toBeVisible();
  await waitForPlayableAudio(page);
  const initialTime = await readAudioTime(page);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect.poll(() => readAudioTime(page)).toBeGreaterThan(initialTime + 0.5);

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const beforeSeek = await readAudioTime(page);
  await page.getByRole("button", { name: "Forward 30", exact: true }).click();
  await expect.poll(() => readAudioTime(page)).toBeGreaterThan(beforeSeek + 0.5);
  const resumePoint = await readAudioTime(page);

  await expect
    .poll(() =>
      page.evaluate((activeBookId) => {
        const value = window.localStorage.getItem(
          `adaptive-audio-player.playback.${activeBookId}`,
        );
        return value ? (JSON.parse(value) as { progressSeconds: number }).progressSeconds : -1;
      }, importedBookId),
    )
    .toBe(Math.floor(resumePoint));
  await expect.poll(() => progressRequests.length).toBeGreaterThan(0);
  for (const request of progressRequests) {
    expect(Object.keys(request).sort()).toEqual([
      "artifactId",
      "chapterIndex",
      "durationSeconds",
      "positionSeconds",
      "revision",
      "speed",
    ]);
    expect(request.artifactId).toBe("e2e-current-sample");
    expect(request.positionSeconds).toBeGreaterThanOrEqual(0);
    expect(request.positionSeconds).toBeLessThanOrEqual(request.durationSeconds);
  }
  expect(legacySyncRequests).toEqual([]);

  await page.reload();
  const persistedAfterReload = await page.evaluate((activeBookId) => {
    const value = window.localStorage.getItem(
      `adaptive-audio-player.playback.${activeBookId}`,
    );
    return value ? (JSON.parse(value) as { progressSeconds: number }).progressSeconds : -1;
  }, importedBookId);
  expect(persistedAfterReload).toBe(Math.floor(resumePoint));
  await waitForPlayableAudio(page);
  await expect
    .poll(async () => Math.abs((await readAudioTime(page)) - Math.floor(resumePoint)))
    .toBeLessThanOrEqual(1.5);

  await page.getByRole("button", { name: "Back 15", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => readAudioTime(page)).toBeGreaterThan(0.25);

  await page.clock.install();
  await page.getByRole("button", { name: "Sleep: Off", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sleep: 15 min", exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(15 * 60 * 1_000);
  await expect
    .poll(() =>
      page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.paused),
    )
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Sleep: Off", exact: true }),
  ).toBeVisible();

  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  expect(legacySyncRequests).toEqual([]);
  expect(browserErrors).toEqual([]);
});
