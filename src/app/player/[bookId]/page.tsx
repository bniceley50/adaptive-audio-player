"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { RemovedBookRecoveryCard } from "@/components/library/removed-book-recovery-card";
import { AppShell } from "@/components/shared/app-shell";
import { NowPlaying } from "@/components/player/now-playing";
import { restoreBookFromBackendSnapshot } from "@/lib/backend/client-restore";
import {
  describeListeningTasteSource,
  readLocalGenerationOutput,
  readLocalDraftText,
  readLocalLibraryBook,
  resolveListeningTaste,
  readLocalLibraryBookTitle,
  readRemovedLocalLibraryBook,
  readLocalSampleRequest,
} from "@/lib/library/local-library";
import { readPersistedPlaybackState } from "@/lib/playback/local-playback";
import { parseChapters } from "@/lib/parser/parse-chapters";
import type { Chapter, ListeningMode } from "@/lib/types/models";

interface PlayerPageProps {
  params: Promise<{ bookId: string }>;
}

const narratorNames: Record<string, string> = {
  marlowe: "Marlowe",
  sloane: "Sloane",
  jules: "Jules",
};

function getBookCoverTheme(title: string) {
  const themes = [
    "from-amber-200 via-orange-100 to-stone-50",
    "from-sky-200 via-cyan-100 to-white",
    "from-rose-200 via-fuchsia-100 to-white",
    "from-emerald-200 via-teal-100 to-white",
    "from-violet-200 via-indigo-100 to-white",
  ];
  const index =
    title.split("").reduce((sum, character) => sum + character.charCodeAt(0), 0) %
    themes.length;
  return themes[index];
}

function getBookInitials(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function PlayerPage({ params }: PlayerPageProps) {
  const { bookId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [resolvedTaste] = useState(() =>
    typeof window !== "undefined"
      ? resolveListeningTaste(bookId)
      : { profile: null, source: "none" as const },
  );
  const hasQueryOverride =
    searchParams.has("narrator") ||
    searchParams.has("mode") ||
    searchParams.has("artifactId");
  const narratorId =
    searchParams.get("narrator") ??
    resolvedTaste.profile?.narratorId ??
    "marlowe";
  const mode = (searchParams.get("mode") ??
    resolvedTaste.profile?.mode ??
    "ambient") as ListeningMode;
  const [draftText] = useState(() =>
    typeof window !== "undefined"
      ? readLocalDraftText(bookId)
      : "",
  );
  const [bookTitle] = useState(() =>
    typeof window !== "undefined"
      ? readLocalLibraryBookTitle(bookId) ?? `Book ${bookId}`
      : `Book ${bookId}`,
  );
  const [bookMeta] = useState(() =>
    typeof window !== "undefined" ? readLocalLibraryBook(bookId) : null,
  );
  const [removedBook] = useState(() =>
    typeof window !== "undefined" ? readRemovedLocalLibraryBook(bookId) : null,
  );
  const [generatedSample] = useState(() =>
    typeof window !== "undefined" ? readLocalSampleRequest() : null,
  );
  const [persistedPlaybackState] = useState(() =>
    typeof window !== "undefined" ? readPersistedPlaybackState(bookId) : null,
  );
  const [sampleOutput] = useState(() =>
    typeof window !== "undefined"
      ? readLocalGenerationOutput(bookId, "sample-generation")
      : null,
  );
  const [fullBookOutput] = useState(() =>
    typeof window !== "undefined"
      ? readLocalGenerationOutput(bookId, "full-book-generation")
      : null,
  );
  const [recoveryState, setRecoveryState] = useState<
    "idle" | "recovering" | "missing"
  >(() =>
    !removedBook && !draftText ? "recovering" : "idle",
  );

  const chapters = useMemo(() => parseChapters(draftText), [draftText]);
  const narratorName = narratorNames[narratorId] ?? narratorNames.marlowe;
  const resolvedTasteMeta = describeListeningTasteSource(resolvedTaste);
  const sampleIsReady =
    (!!sampleOutput &&
      sampleOutput.bookId === bookId &&
      sampleOutput.narratorId === narratorId &&
      sampleOutput.mode === mode) ||
    (generatedSample?.bookId === bookId &&
      generatedSample.narratorId === narratorId &&
      generatedSample.mode === mode);
  const fullBookIsReady = !!fullBookOutput?.assetPath;
  const persistedArtifactKind = persistedPlaybackState?.playbackArtifactKind ?? null;
  const historicalArtifactId = searchParams.get("artifactId");
  const historicalArtifactKind =
    searchParams.get("artifactKind") === "full-book-generation"
      ? "full-book-generation"
      : searchParams.get("artifactKind") === "sample-generation"
        ? "sample-generation"
        : null;
  const renderState =
    searchParams.get("renderState") === "current"
      ? "current"
      : searchParams.get("renderState") === "archived"
        ? "archived"
        : null;
  const preferredAudioKind =
    historicalArtifactId && historicalArtifactKind
      ? historicalArtifactKind
      : searchParams.get("artifact") === "sample"
      ? sampleIsReady
        ? "sample-generation"
        : fullBookIsReady
          ? "full-book-generation"
          : null
      : searchParams.get("artifact") === "full"
        ? fullBookIsReady
          ? "full-book-generation"
          : sampleIsReady
            ? "sample-generation"
            : null
      : persistedArtifactKind === "full-book-generation" && fullBookIsReady
        ? "full-book-generation"
        : persistedArtifactKind === "sample-generation" && sampleIsReady
          ? "sample-generation"
          : fullBookIsReady
            ? "full-book-generation"
            : sampleIsReady
              ? "sample-generation"
              : null
      ;
  const audioUrl =
    historicalArtifactId && historicalArtifactKind
      ? `/api/audio/generated/artifacts/${historicalArtifactId}`
      : preferredAudioKind
        ? `/api/audio/generated/${bookId}?kind=${preferredAudioKind}`
        : null;
  const playerChapters: Chapter[] =
    chapters.length > 0
      ? chapters
      : [
          {
            id: "chapter-empty",
            title: "No chapter loaded",
            text: "No imported draft found yet. Return to import and carry a chapter through setup first.",
            order: 0,
        },
      ];
  const listeningState = historicalArtifactId && renderState === "archived"
    ? {
        label: "Listening to an archived render",
        detail:
          "This session is using a preserved historical version, not the current approved render.",
        action: "Review the book timeline to compare archived and current audio",
      }
    : preferredAudioKind === "full-book-generation"
      ? {
          label: "Listening to the current full book",
          detail:
            "The backend has a current full-book render for this setup, so this is the main listening path.",
          action: "Stay in playback or jump back to the book timeline",
        }
      : preferredAudioKind === "sample-generation"
        ? {
            label: "Listening to the current sample",
            detail:
              "You are previewing the current sample for this narrator and mode before or instead of the full-book render.",
            action: "Use this to judge the taste or return to setup to render the full book",
          }
        : {
            label: "Audio needs generation",
            detail:
              "This player opened without a generated render for the current taste, so playback is locked until setup creates one.",
            action: "Go back to setup and generate a sample first",
          };

  useEffect(() => {
    if (removedBook || draftText) {
      return;
    }

    let cancelled = false;

    async function recoverBook() {
      setRecoveryState("recovering");
      const result = await restoreBookFromBackendSnapshot(bookId);
      if (cancelled) {
        return;
      }

      if (result === "restored") {
        router.refresh();
        window.location.assign(`/player/${bookId}${window.location.search}`);
        return;
      }

      setRecoveryState("missing");
    }

    void recoverBook();

    return () => {
      cancelled = true;
    };
  }, [bookId, draftText, removedBook, router]);

  if (!draftText && removedBook) {
    return (
      <AppShell eyebrow="Player" title={`${removedBook.book.title} needs recovery`}>
        <RemovedBookRecoveryCard removedBook={removedBook} returnHref="/" />
      </AppShell>
    );
  }

  if (!draftText && recoveryState === "recovering") {
    return (
      <AppShell eyebrow="Player" title="Restoring player">
        <section className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-stone-950">
            Restoring this book from your synced library
          </h2>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            This player opened without local book data, so the app is recovering the
            synced draft and playback context from your current workspace.
          </p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell eyebrow="Player" title={`Now playing ${bookTitle}`}>
      <section className="rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#fffefb_0%,#ffffff_42%,#eef4ff_100%)] p-6 shadow-[0_24px_70px_-46px_rgba(28,25,23,0.42)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              Current state
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-950">
              {listeningState.label}
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {listeningState.detail}
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-white/80 bg-white/85 px-4 py-4 shadow-sm backdrop-blur">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
              Next action
            </p>
            <p className="mt-2 max-w-xs text-base font-semibold text-stone-950">
              {listeningState.action}
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-[1.15fr_0.85fr_0.85fr]">
          <article className="rounded-[1.5rem] border border-stone-200/80 bg-white/85 p-4 shadow-sm">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
              Book identity
            </p>
            <div className="mt-3 flex items-start gap-4">
              <div
                className={`flex h-24 w-20 shrink-0 flex-col justify-between overflow-hidden rounded-[1.2rem] border border-stone-200 bg-gradient-to-br ${bookMeta?.coverTheme ?? getBookCoverTheme(bookTitle)} p-3 shadow-sm`}
              >
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-stone-600">
                  {bookMeta?.coverLabel ?? "Playback"}
                </p>
                <p className="text-xl font-semibold tracking-tight text-stone-950">
                  {bookMeta?.coverGlyph ?? getBookInitials(bookTitle)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-lg font-semibold text-stone-950">{bookTitle}</p>
                <p className="mt-2 text-sm text-stone-600">
                  {playerChapters.length} chapter{playerChapters.length === 1 ? "" : "s"} in this listening session
                </p>
                {bookMeta?.genreLabel ? (
                  <span className="mt-3 inline-flex rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-fuchsia-700">
                    {bookMeta.genreLabel}
                  </span>
                ) : null}
              </div>
            </div>
          </article>
          <article className="rounded-[1.5rem] border border-stone-200/80 bg-white/85 p-4 shadow-sm">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
              Render type
            </p>
            <p className="mt-2 text-lg font-semibold text-stone-950">
              {historicalArtifactId && renderState === "archived"
                ? "Archived render"
                : preferredAudioKind === "full-book-generation"
                  ? "Current full book"
                  : preferredAudioKind === "sample-generation"
                    ? "Current sample"
                    : "Not generated"}
            </p>
          </article>
          <article className="rounded-[1.5rem] border border-stone-200/80 bg-white/85 p-4 shadow-sm">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
              Active taste
            </p>
            <p className="mt-2 text-lg font-semibold text-stone-950">
              {narratorName} in {mode}
            </p>
          </article>
        </div>
      </section>
      <NowPlaying
        audioKind={preferredAudioKind}
        audioUrl={audioUrl}
        bookId={bookId}
        bookTitle={bookTitle}
        chapters={playerChapters}
        mode={mode}
        narratorName={narratorName}
        playbackIsReady={preferredAudioKind !== null}
      />
      <section className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-5 rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
          <span className="font-semibold text-stone-900">Generated audio:</span>{" "}
          {historicalArtifactId && preferredAudioKind === "full-book-generation"
            ? "A preserved historical full-book render is ready in this player."
            : historicalArtifactId && preferredAudioKind === "sample-generation"
              ? "A preserved historical sample render is ready in this player."
            : preferredAudioKind === "full-book-generation"
            ? "Full-book audio is ready in this player."
            : sampleIsReady
              ? "Sample audio is ready in this player."
              : "No generated audio matches this narrator and mode yet."}
        </div>
        {sampleIsReady && fullBookIsReady ? (
          <div className="mb-5 flex flex-wrap gap-3">
            <Link
              className={`rounded-full border px-4 py-2 text-sm font-medium ${
                preferredAudioKind === "sample-generation"
                  ? "border-stone-950 bg-stone-950 text-white"
                  : "border-stone-300 text-stone-700"
              }`}
              href={`/player/${bookId}?narrator=${narratorId}&mode=${mode}&artifact=sample&renderState=current`}
            >
              Use sample audio
            </Link>
            <Link
              className={`rounded-full border px-4 py-2 text-sm font-medium ${
                preferredAudioKind === "full-book-generation"
                  ? "border-stone-950 bg-stone-950 text-white"
                  : "border-stone-300 text-stone-700"
              }`}
              href={`/player/${bookId}?narrator=${narratorId}&mode=${mode}&artifact=full&renderState=current`}
            >
              Use full-book audio
            </Link>
          </div>
        ) : null}
        {renderState === "current" ? (
          <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-medium">
              You are listening to the current approved render for this book.
            </p>
            <div className="mt-3">
              <Link
                className="rounded-full border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-900"
                href={`/books/${bookId}#render-history`}
              >
                Review render timeline
              </Link>
            </div>
          </div>
        ) : null}
        {renderState === "archived" ? (
          <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-medium">
              You are listening to a preserved archived render for this book.
            </p>
            <p className="mt-2">
              The current approved version may differ from this historical playback.
            </p>
            <div className="mt-3">
              <Link
                className="rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900"
                href={`/books/${bookId}#render-history`}
              >
                Review render timeline
              </Link>
            </div>
          </div>
        ) : null}
        {hasQueryOverride ? (
          <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            This player session is using a link-specific taste override.
          </div>
        ) : resolvedTaste.source === "saved" && resolvedTaste.profile ? (
          <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-medium">
              This player is using this book&apos;s saved taste:{" "}
              {resolvedTaste.profile.narratorName} in{" "}
              <span className="capitalize">{resolvedTaste.profile.mode}</span>.
            </p>
            <p className="mt-2">{resolvedTasteMeta.detail}</p>
          </div>
        ) : resolvedTaste.source === "default" && resolvedTaste.profile ? (
          <div className="mb-5 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
            <p className="font-medium">
              This player is using your default taste:{" "}
              {resolvedTaste.profile.narratorName} in{" "}
              <span className="capitalize">{resolvedTaste.profile.mode}</span>.
            </p>
            <p className="mt-2">{resolvedTasteMeta.detail}</p>
          </div>
        ) : resolvedTaste.source === "recent" && resolvedTaste.profile ? (
          <div className="mb-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
            <p className="font-medium">
              No default is saved, so this player is using your latest taste:{" "}
              {resolvedTaste.profile.narratorName} in{" "}
              <span className="capitalize">{resolvedTaste.profile.mode}</span>.
            </p>
            <p className="mt-2">{resolvedTasteMeta.detail}</p>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Link
            className="rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700"
            href={`/books/${bookId}?from=player`}
          >
            Back to setup
          </Link>
          <Link
            className="rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700"
            href="/import"
          >
            Import another draft
          </Link>
          <Link
            className="rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700"
            href="/#default-taste"
          >
            Manage default taste
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
