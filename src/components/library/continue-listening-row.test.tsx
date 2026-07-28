/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  LibraryBookActivity,
  LibraryBookSummary,
  LibraryGenerationKind,
} from "@/lib/client/books-api";

import {
  ContinueListeningRow,
  resolveLibraryBookState,
  type LibraryBookStateKind,
} from "./continue-listening-row";

const roots: Root[] = [];
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function emptyActivity(): LibraryBookActivity {
  return { jobs: [], outputs: [], progress: null };
}

function output(kind: LibraryGenerationKind) {
  const shortKind = kind === "sample-generation" ? "sample" : "full";
  return {
    artifactId: `artifact-${shortKind}`,
    artifactUrl: `/api/audio/generated/artifacts/artifact-${shortKind}`,
    generatedAt: "2026-07-19T12:01:00.000Z",
    isCurrent: true,
    jobId: `job-${shortKind}`,
    kind,
  };
}

function job(
  kind: LibraryGenerationKind,
  status: LibraryBookActivity["jobs"][number]["status"],
) {
  return {
    completedAt:
      status === "completed" || status === "failed" || status === "cancelled"
        ? "2026-07-19T12:02:00.000Z"
        : null,
    createdAt: "2026-07-19T12:00:00.000Z",
    kind,
    status,
  };
}

function book(index: number): LibraryBookSummary {
  return {
    activity: emptyActivity(),
    bookId: `book-${index}`,
    chapterCount: index + 1,
    title: `Book ${index}`,
    updatedAt: `2026-07-19T12:${index.toString().padStart(2, "0")}:00.000Z`,
  };
}

async function renderLibrary(books: LibraryBookSummary[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      json: async () => ({ books }),
      ok: true,
      status: 200,
    }),
  );
  window.localStorage.clear();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);

  await act(async () => {
    root.render(<ContinueListeningRow />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  return container;
}

afterEach(() => {
  for (const root of roots.splice(0, roots.length)) {
    act(() => root.unmount());
  }
  document.body.replaceChildren();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("resolveLibraryBookState", () => {
  it.each<{
    actionKind: "delete" | "link";
    actionLabel: string;
    activity: LibraryBookActivity;
    href: string | null;
    kind: LibraryBookStateKind;
    label: string;
  }>([
    {
      actionKind: "link",
      actionLabel: "Choose a voice",
      activity: emptyActivity(),
      href: "/books/book-state",
      kind: "needs-setup",
      label: "Voice setup needed",
    },
    {
      actionKind: "link",
      actionLabel: "View sample progress",
      activity: {
        ...emptyActivity(),
        jobs: [job("sample-generation", "running")],
      },
      href: "/books/book-state",
      kind: "sample-generating",
      label: "Sample is being created",
    },
    {
      actionKind: "link",
      actionLabel: "Listen to sample",
      activity: {
        ...emptyActivity(),
        outputs: [output("sample-generation")],
      },
      href: "/player/book-state?artifact=sample",
      kind: "sample-ready",
      label: "Sample ready",
    },
    {
      actionKind: "link",
      actionLabel: "View audiobook progress",
      activity: {
        ...emptyActivity(),
        jobs: [job("full-book-generation", "queued")],
      },
      href: "/books/book-state",
      kind: "book-generating",
      label: "Audiobook is being created",
    },
    {
      actionKind: "link",
      actionLabel: "Listen to audiobook",
      activity: {
        ...emptyActivity(),
        outputs: [output("full-book-generation")],
      },
      href: "/player/book-state?artifact=full",
      kind: "ready",
      label: "Audiobook ready",
    },
    {
      actionKind: "link",
      actionLabel: "Review and retry",
      activity: {
        ...emptyActivity(),
        jobs: [job("sample-generation", "failed")],
      },
      href: "/books/book-state",
      kind: "failed",
      label: "Audio needs attention",
    },
  ])("maps $kind to one exact label and action", (testCase) => {
    const state = resolveLibraryBookState({
      activity: testCase.activity,
      bookId: "book-state",
    });

    expect(state).toMatchObject({
      actionKind: testCase.actionKind,
      actionLabel: testCase.actionLabel,
      href: testCase.href,
      kind: testCase.kind,
      label: testCase.label,
    });
  });

  it("offers an exact resume point only when progress matches the playable artifact", () => {
    const activity: LibraryBookActivity = {
      jobs: [],
      outputs: [output("sample-generation")],
      progress: {
        artifactId: "artifact-sample",
        chapterIndex: 1,
        durationSeconds: 300,
        positionSeconds: 78,
        updatedAt: "2026-07-19T12:03:00.000Z",
      },
    };

    expect(
      resolveLibraryBookState({ activity, bookId: "book-state" }),
    ).toMatchObject({
      actionLabel: "Continue sample",
      resumeLabel: "Resume at 1:18 · Chapter 2",
    });
    expect(
      resolveLibraryBookState({
        activity: {
          ...activity,
          progress: { ...activity.progress!, artifactId: "artifact-old" },
        },
        bookId: "book-state",
      }),
    ).toMatchObject({
      actionLabel: "Listen to sample",
      resumeLabel: null,
    });
  });
});

describe("ContinueListeningRow", () => {
  it("keeps the zero-book home focused on one import action", async () => {
    const container = await renderLibrary([]);

    expect(container.textContent).toContain("Books: 0");
    expect(container.textContent).toContain("Add your first book");
    expect(container.querySelectorAll('[data-testid^="shelf-book-"]')).toHaveLength(0);
    expect(container.querySelector('input[type="search"]')).toBeNull();
  });

  it("shows one book with its exact readiness and primary action", async () => {
    const container = await renderLibrary([book(1)]);
    const row = container.querySelector('[data-testid="shelf-book-book-1"]');

    expect(container.textContent).toContain("Books: 1");
    expect(row?.textContent).toContain("Book 1");
    expect(row?.textContent).toContain("Voice setup needed");
    expect(
      row?.querySelector<HTMLAnchorElement>('a[aria-label="Open Book 1"]')
        ?.getAttribute("href"),
    ).toBe("/books/book-1");
    expect(
      row?.querySelector<HTMLAnchorElement>(
        'a[href="/books/book-1"]:not([aria-label])',
      )?.textContent,
    ).toBe("Choose a voice");
  });

  it("makes the visible book content link to the current primary destination", async () => {
    const sampleReadyBook = book(1);
    sampleReadyBook.activity.outputs = [output("sample-generation")];
    const container = await renderLibrary([sampleReadyBook]);
    const row = container.querySelector('[data-testid="shelf-book-book-1"]');

    expect(
      row?.querySelector<HTMLAnchorElement>('a[aria-label="Open Book 1"]')
        ?.getAttribute("href"),
    ).toBe("/player/book-1?artifact=sample");
  });

  it("keeps a many-book library scannable without search or mode controls", async () => {
    const books = Array.from({ length: 12 }, (_, index) => book(index + 1));
    const container = await renderLibrary(books);

    expect(container.textContent).toContain("Books: 12");
    expect(container.querySelectorAll('[data-testid^="shelf-book-"]')).toHaveLength(12);
    expect(container.querySelector('input[type="search"]')).toBeNull();
    expect(container.querySelector("select")).toBeNull();
    expect(container.textContent).not.toContain("Listening mode");
  });
});
