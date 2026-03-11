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
  replaceRemovedLocalLibraryBooks,
  resolveListeningTaste,
  readRemovedLocalLibraryBook,
  readLocalSampleRequest,
  writeLocalGenerationOutput,
  writeLocalSampleRequest,
} from "@/lib/library/local-library";
import {
  readPersistedPlaybackState,
  type PlaybackDefaults,
} from "@/lib/playback/local-playback";
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
  const [resolvedTaste, setResolvedTaste] = useState(() =>
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
  const [hydratedBookMeta, setHydratedBookMeta] = useState(() =>
    typeof window !== "undefined" ? readLocalLibraryBook(bookId) : null,
  );
  const bookTitle = hydratedBookMeta?.title ?? `Book ${bookId}`;
  const [removedBook] = useState(() =>
    typeof window !== "undefined" ? readRemovedLocalLibraryBook(bookId) : null,
  );
  const [hydratedRemovedBook, setHydratedRemovedBook] = useState(removedBook);
  const [generatedSample, setGeneratedSample] = useState(() =>
    typeof window !== "undefined" ? readLocalSampleRequest() : null,
  );
  const [persistedPlaybackState] = useState(() =>
    typeof window !== "undefined" ? readPersistedPlaybackState(bookId) : null,
  );
  const [hydratedPlaybackState, setHydratedPlaybackState] = useState(
    persistedPlaybackState,
  );
  const [hydratedPlaybackDefaults, setHydratedPlaybackDefaults] =
    useState<PlaybackDefaults | null>(null);
  const [sampleOutput, setSampleOutput] = useState(() =>
    typeof window !== "undefined"
      ? readLocalGenerationOutput(bookId, "sample-generation")
      : null,
  );
  const [fullBookOutput, setFullBookOutput] = useState(() =>
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
  const playerNextMove = preferredAudioKind === "full-book-generation"
    ? {
        eyebrow: "Recommended next move",
        label: "Stay with the current full-book render",
        detail:
          "This is the best listening path for this title right now, so the next useful move is to keep going or resume from your current chapter.",
        href: `/player/${bookId}?artifact=full&renderState=current`,
        cta: "Keep listening",
      }
    : preferredAudioKind === "sample-generation"
      ? {
          eyebrow: "Recommended next move",
          label: "Judge the taste from the sample",
          detail:
            "Use this preview to decide whether to keep listening here or move back into setup for a full-book render.",
          href: `/player/${bookId}?artifact=sample&renderState=${renderState ?? "current"}${hasQueryOverride ? `&narrator=${narratorId}&mode=${mode}` : ""}`,
          cta: "Stay with the sample",
        }
      : {
          eyebrow: "Recommended next move",
          label: "Return to setup and generate audio",
          detail:
            "Playback is blocked until setup creates a sample or full-book render for this narrator and mode.",
          href: `/books/${bookId}?from=player`,
          cta: "Back to setup",
        };
  const playerFollowUp = fullBookIsReady || sampleIsReady
    ? {
        eyebrow: "After that",
        label: "Review the render timeline",
        detail:
          "Compare the current approved render with preserved historical versions when you want to understand how this title evolved.",
        href: `/books/${bookId}#render-history`,
        cta: "Open render timeline",
      }
    : {
        eyebrow: "After that",
        label: "Keep the taste aligned",
        detail:
          "Once you like this voice direction, save it from setup so future imports can start from the same default taste.",
        href: `/books/${bookId}?from=player`,
        cta: "Review setup",
      };
  const playerSupport = {
    eyebrow: "Keep moving",
    label: "Bring another title into the flow",
    detail:
      "When this listening session is on track, jump back to import and bring the next book through the same taste-first workflow.",
    href: "/import",
    cta: "Import another draft",
  };
  const playerJourneyIndex = preferredAudioKind === "full-book-generation"
    ? 3
    : preferredAudioKind === "sample-generation"
      ? 2
      : 1;
  const playerJourney = [
    {
      id: "import",
      label: "01",
      title: "Import",
      detail: "Bring in the manuscript",
    },
    {
      id: "taste",
      label: "02",
      title: "Taste",
      detail: "Choose narrator and mode",
    },
    {
      id: "sample",
      label: "03",
      title: "Sample",
      detail: "Judge the preview render",
    },
    {
      id: "listen",
      label: "04",
      title: "Listen",
      detail: "Play the approved version",
    },
  ] as const;

  useEffect(() => {
    if (hydratedBookMeta) {
      return;
    }

    let cancelled = false;

    async function hydrateBookMetaFromBackend() {
      const response = await fetch("/api/sync/library").catch(() => null);
      const payload = response
        ? ((await response.json().catch(() => null)) as
            | {
                snapshot?: import("@/lib/backend/types").LibrarySyncSnapshot | null;
              }
            | null)
        : null;

      if (cancelled || !payload?.snapshot) {
        return;
      }

      const syncedBook =
        payload.snapshot.libraryBooks.find((book) => book.bookId === bookId) ?? null;

      if (syncedBook) {
        setHydratedBookMeta(syncedBook);
      }
    }

    void hydrateBookMetaFromBackend();

    return () => {
      cancelled = true;
    };
  }, [bookId, hydratedBookMeta]);

  useEffect(() => {
    if (hydratedRemovedBook) {
      return;
    }

    let cancelled = false;

    async function hydrateRemovedStateFromBackend() {
      const response = await fetch("/api/sync/library").catch(() => null);
      const payload = response
        ? ((await response.json().catch(() => null)) as
            | {
                snapshot?: import("@/lib/backend/types").LibrarySyncSnapshot | null;
              }
            | null)
        : null;

      if (cancelled || !payload?.snapshot) {
        return;
      }

      const removedSnapshot =
        payload.snapshot.removedBooks?.find((entry) => entry.book.bookId === bookId) ?? null;

      if (!removedSnapshot) {
        return;
      }

      replaceRemovedLocalLibraryBooks(payload.snapshot.removedBooks ?? [removedSnapshot]);
      setHydratedRemovedBook(readRemovedLocalLibraryBook(bookId));
      setRecoveryState("idle");
    }

    void hydrateRemovedStateFromBackend();

    return () => {
      cancelled = true;
    };
  }, [bookId, hydratedRemovedBook]);

  useEffect(() => {
    if (hydratedRemovedBook || draftText) {
      return;
    }

    let cancelled = false;

    async function recoverBook() {
      setRecoveryState("recovering");
      const result = await restoreBookFromBackendSnapshot(bookId);
      if (cancelled) {
        return;
      }

      if (result === "removed") {
        setHydratedRemovedBook(readRemovedLocalLibraryBook(bookId));
        setRecoveryState("idle");
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
  }, [bookId, draftText, hydratedRemovedBook, router]);

  useEffect(() => {
    if (resolvedTaste.source !== "none") {
      return;
    }

    let cancelled = false;

    async function hydrateTasteFromBackend() {
      const response = await fetch("/api/sync/library").catch(() => null);
      const payload = response
        ? ((await response.json().catch(() => null)) as
            | {
                snapshot?: import("@/lib/backend/types").LibrarySyncSnapshot | null;
              }
            | null)
        : null;

      if (cancelled || !payload?.snapshot) {
        return;
      }

      const snapshot = payload.snapshot;
      const savedProfile =
        snapshot.listeningProfiles.find((profile) => profile.bookId === bookId) ?? null;
      const backendTaste = savedProfile
        ? { profile: savedProfile, source: "saved" as const }
        : snapshot.defaultListeningProfile
          ? {
              profile: snapshot.defaultListeningProfile,
              source: "default" as const,
            }
          : snapshot.listeningProfiles[0]
            ? { profile: snapshot.listeningProfiles[0], source: "recent" as const }
            : { profile: null, source: "none" as const };

      if (backendTaste.source === "none" || !backendTaste.profile) {
        return;
      }

      setResolvedTaste(backendTaste);
    }

    void hydrateTasteFromBackend();

    return () => {
      cancelled = true;
    };
  }, [bookId, resolvedTaste.source]);

  useEffect(() => {
    if (hydratedRemovedBook || !draftText || (hydratedPlaybackState && hydratedPlaybackDefaults)) {
      return;
    }

    let cancelled = false;

    async function hydratePlaybackStateFromBackend() {
      const response = await fetch("/api/sync/library").catch(() => null);
      const payload = response
        ? ((await response.json().catch(() => null)) as
            | {
                snapshot?: import("@/lib/backend/types").LibrarySyncSnapshot | null;
              }
            | null)
        : null;

      if (cancelled || !payload?.snapshot) {
        return;
      }

      const syncedPlayback =
        payload.snapshot.playbackStates.find((entry) => entry.bookId === bookId)?.state ??
        null;
      const syncedPlaybackDefaults = payload.snapshot.playbackDefaults ?? null;

      if (syncedPlayback) {
        setHydratedPlaybackState(syncedPlayback);
      }

      if (syncedPlaybackDefaults) {
        setHydratedPlaybackDefaults(syncedPlaybackDefaults);
      }
    }

    void hydratePlaybackStateFromBackend();

    return () => {
      cancelled = true;
    };
  }, [bookId, draftText, hydratedPlaybackDefaults, hydratedPlaybackState, hydratedRemovedBook]);

  useEffect(() => {
    if (hydratedRemovedBook || !draftText) {
      return;
    }

    if (generatedSample && sampleOutput && fullBookOutput) {
      return;
    }

    let cancelled = false;

    async function hydrateGenerationStateFromBackend() {
      const response = await fetch("/api/sync/library").catch(() => null);
      const payload = response
        ? ((await response.json().catch(() => null)) as
            | {
                snapshot?: import("@/lib/backend/types").LibrarySyncSnapshot | null;
              }
            | null)
        : null;

      if (cancelled || !payload?.snapshot) {
        return;
      }

      const snapshot = payload.snapshot;
      const backendSampleRequest =
        snapshot.sampleRequest?.bookId === bookId ? snapshot.sampleRequest : null;
      const backendSampleOutput =
        snapshot.generationOutputs?.find(
          (output) =>
            output.bookId === bookId && output.kind === "sample-generation",
        ) ?? null;
      const backendFullBookOutput =
        snapshot.generationOutputs?.find(
          (output) =>
            output.bookId === bookId && output.kind === "full-book-generation",
        ) ?? null;

      if (!generatedSample && backendSampleRequest) {
        const hydratedRequest = {
          bookId: backendSampleRequest.bookId,
          narratorId: backendSampleRequest.narratorId,
          mode: backendSampleRequest.mode as ListeningMode,
        };
        writeLocalSampleRequest(hydratedRequest);
        setGeneratedSample(hydratedRequest);
      }

      if (!sampleOutput && backendSampleOutput) {
        writeLocalGenerationOutput(backendSampleOutput);
        setSampleOutput(backendSampleOutput);
      }

      if (!fullBookOutput && backendFullBookOutput) {
        writeLocalGenerationOutput(backendFullBookOutput);
        setFullBookOutput(backendFullBookOutput);
      }
    }

    void hydrateGenerationStateFromBackend();

    return () => {
      cancelled = true;
    };
  }, [bookId, draftText, fullBookOutput, generatedSample, hydratedRemovedBook, sampleOutput]);

  if (hydratedRemovedBook) {
    return (
      <AppShell eyebrow="Player" title={`${hydratedRemovedBook.book.title} needs recovery`}>
        <RemovedBookRecoveryCard removedBook={hydratedRemovedBook} returnHref="/" />
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
      <section className="rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#fffdf8_0%,#ffffff_42%,#eef4ff_100%)] p-6 shadow-[0_22px_60px_-42px_rgba(28,25,23,0.38)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              Journey
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-950">
              Import, shape, preview, then listen
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Playback is the last step of the adaptive audiobook loop. From here,
              you can keep listening, compare preserved renders, or return to setup
              when you need to reshape the taste.
            </p>
          </div>
          <div className="rounded-[1.4rem] border border-white/80 bg-white/85 px-4 py-3 shadow-sm backdrop-blur">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
              You are here
            </p>
            <p className="mt-2 text-lg font-semibold text-stone-950">
              {playerJourney[playerJourneyIndex]?.title}
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {playerJourney.map((step, index) => {
            const state =
              index < playerJourneyIndex
                ? "complete"
                : index === playerJourneyIndex
                  ? "active"
                  : "upcoming";
            return (
              <article
                key={step.id}
                className={`rounded-[1.4rem] border px-4 py-4 shadow-sm transition ${
                  state === "active"
                    ? "border-stone-900 bg-stone-950 text-white"
                    : state === "complete"
                      ? "border-emerald-200 bg-emerald-50/80"
                      : "border-stone-200/80 bg-white/80"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] ${
                      state === "active"
                        ? "bg-white/15 text-white"
                        : state === "complete"
                          ? "bg-emerald-600 text-white"
                          : "bg-stone-200 text-stone-700"
                    }`}
                  >
                    {step.label}
                  </span>
                  <span
                    className={`text-[0.65rem] font-semibold uppercase tracking-[0.18em] ${
                      state === "active"
                        ? "text-white/70"
                        : state === "complete"
                          ? "text-emerald-700"
                          : "text-stone-500"
                    }`}
                  >
                    {state === "active"
                      ? "Current"
                      : state === "complete"
                        ? "Done"
                        : "Next"}
                  </span>
                </div>
                <p
                  className={`mt-4 text-base font-semibold ${
                    state === "active" ? "text-white" : "text-stone-950"
                  }`}
                >
                  {step.title}
                </p>
                <p
                  className={`mt-1 text-sm leading-6 ${
                    state === "active" ? "text-white/75" : "text-stone-600"
                  }`}
                >
                  {step.detail}
                </p>
              </article>
            );
          })}
        </div>
      </section>
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
                className={`flex h-24 w-20 shrink-0 flex-col justify-between overflow-hidden rounded-[1.2rem] border border-stone-200 bg-gradient-to-br ${hydratedBookMeta?.coverTheme ?? getBookCoverTheme(bookTitle)} p-3 shadow-sm`}
              >
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-stone-600">
                  {hydratedBookMeta?.coverLabel ?? "Playback"}
                </p>
                <p className="text-xl font-semibold tracking-tight text-stone-950">
                  {hydratedBookMeta?.coverGlyph ?? getBookInitials(bookTitle)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-lg font-semibold text-stone-950">{bookTitle}</p>
                <p className="mt-2 text-sm text-stone-600">
                  {playerChapters.length} chapter{playerChapters.length === 1 ? "" : "s"} in this listening session
                </p>
                {hydratedBookMeta?.genreLabel ? (
                  <span className="mt-3 inline-flex rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-fuchsia-700">
                    {hydratedBookMeta.genreLabel}
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
      {sampleIsReady && fullBookIsReady ? (
        <section className="rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#111827_0%,#1c1917_45%,#292524_100%)] p-6 text-white shadow-[0_28px_80px_-46px_rgba(17,24,39,0.9)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-300">
                Adaptive compare
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Hear the same book in two different modes
              </h2>
              <p className="mt-2 text-sm leading-6 text-stone-300">
                This is the clearest product moment in the app: a lighter sample render
                for taste validation, and a polished full-book render for long-form
                listening. Switch between them to hear the adaptive workflow in action.
              </p>
            </div>
            <div className="rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-3 shadow-sm">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-300">
                Current player
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {preferredAudioKind === "full-book-generation"
                  ? "Full book"
                  : preferredAudioKind === "sample-generation"
                    ? "Sample"
                    : "Not selected"}
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <article
              className={`rounded-[1.5rem] border p-5 shadow-sm transition ${
                preferredAudioKind === "sample-generation"
                  ? "border-amber-300/40 bg-[linear-gradient(135deg,rgba(252,211,77,0.18)_0%,rgba(255,255,255,0.06)_100%)]"
                  : "border-white/10 bg-white/5"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-amber-300 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-stone-950">
                  Sample render
                </span>
                {preferredAudioKind === "sample-generation" ? (
                  <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white">
                    Playing now
                  </span>
                ) : null}
              </div>
              <p className="mt-4 text-lg font-semibold text-white">
                Fast taste check
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-300">
                Use the sample when you want to judge the voice, mode, and feel of the
                book before committing to the long-form render.
              </p>
              <div className="mt-4">
                <Link
                  className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
                  href={`/player/${bookId}?artifact=sample&renderState=current`}
                >
                  Listen to sample
                </Link>
              </div>
            </article>
            <article
              className={`rounded-[1.5rem] border p-5 shadow-sm transition ${
                preferredAudioKind === "full-book-generation"
                  ? "border-emerald-300/35 bg-[linear-gradient(135deg,rgba(74,222,128,0.16)_0%,rgba(255,255,255,0.06)_100%)]"
                  : "border-white/10 bg-white/5"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-emerald-300 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-stone-950">
                  Full-book render
                </span>
                {preferredAudioKind === "full-book-generation" ? (
                  <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white">
                    Playing now
                  </span>
                ) : null}
              </div>
              <p className="mt-4 text-lg font-semibold text-white">
                Main listening path
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-300">
                Use the full-book render when you are ready for the polished, current
                version that carries the title through longer listening sessions.
              </p>
              <div className="mt-4">
                <Link
                  className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
                  href={`/player/${bookId}?artifact=full&renderState=current`}
                >
                  Listen to full book
                </Link>
              </div>
            </article>
          </div>
        </section>
      ) : null}
      <NowPlaying
        audioKind={preferredAudioKind}
        audioUrl={audioUrl}
        bookId={bookId}
        bookTitle={bookTitle}
        chapters={playerChapters}
        initialPlaybackDefaults={hydratedPlaybackDefaults}
        initialPlaybackState={hydratedPlaybackState}
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
        <div className="mb-5 grid gap-4 lg:grid-cols-3">
          {[playerNextMove, playerFollowUp, playerSupport].map((item, index) => (
            <article
              key={item.eyebrow}
              className={`rounded-[1.5rem] border p-5 shadow-sm ${
                index === 0
                  ? "border-emerald-200 bg-emerald-50/80"
                  : index === 1
                    ? "border-sky-200 bg-sky-50/80"
                    : "border-stone-200 bg-stone-50"
              }`}
            >
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-stone-500">
                {item.eyebrow}
              </p>
              <h3 className="mt-3 text-lg font-semibold text-stone-950">{item.label}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">{item.detail}</p>
              <div className="mt-4">
                <Link
                  className="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
                  href={item.href}
                >
                  {item.cta}
                </Link>
              </div>
            </article>
          ))}
        </div>
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
