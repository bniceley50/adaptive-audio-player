"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { AuthorSpotlightCard } from "@/components/library/author-spotlight-card";
import { RemovedBookRecoveryCard } from "@/components/library/removed-book-recovery-card";
import { AppShell } from "@/components/shared/app-shell";
import {
  ActionLaunchpad,
  type ActionLaunchpadItem,
} from "@/components/shared/action-launchpad";
import { BookIdentityCard } from "@/components/shared/book-identity-card";
import { ExperienceModeToggle } from "@/components/shared/experience-mode-toggle";
import { StateSummaryPanel } from "@/components/shared/state-summary-panel";
import { NowPlaying } from "@/components/player/now-playing";
import { getAuthorSpotlight } from "@/features/discovery/author-spotlights";
import {
  getUpdatedAtWeight,
  narratorNames,
  tastePresets,
} from "@/features/player/page-support";
import { restoreBookFromBackendSnapshot } from "@/lib/backend/client-restore";
import { buildImportedAudioChapterSegments } from "@/lib/import/imported-audio-chapters";
import { readImportedAudioAssetUrl } from "@/lib/import/local-audio-assets";
import {
  describeListeningTasteSource,
  readLocalGenerationOutput,
  readLocalDraftText,
  readLocalLibraryBook,
  replaceRemovedLocalLibraryBooks,
  resolvePreferredGenerationOutput,
  resolveListeningTaste,
  readRemovedLocalLibraryBook,
  readLocalSampleRequest,
  writeLocalGenerationOutput,
  writeLocalSampleRequest,
} from "@/lib/library/local-library";
import {
  readPersistedPlaybackState,
  resolvePreferredPlaybackState,
  writePersistedPlaybackState,
  type PlaybackDefaults,
} from "@/lib/playback/local-playback";
import { parseChapters } from "@/lib/parser/parse-chapters";
import type { Chapter, ListeningMode } from "@/lib/types/models";

interface PlayerPageProps {
  params: Promise<{ bookId: string }>;
}

export default function PlayerPage({ params }: PlayerPageProps) {
  const { bookId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [experienceMode, setExperienceMode] = useState<"everyday" | "studio">(
    "everyday",
  );
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
  const [importedAudioUrl, setImportedAudioUrl] = useState<string | null>(null);
  const [recoveryState, setRecoveryState] = useState<
    "idle" | "recovering" | "missing"
  >(() =>
    !removedBook && !draftText ? "recovering" : "idle",
  );

  const chapters = useMemo(() => parseChapters(draftText), [draftText]);
  const narratorName = narratorNames[narratorId] ?? narratorNames.marlowe;
  const isImportedAudioBook = hydratedBookMeta?.sourceType === "audio";
  const importedAudioChapters = useMemo(
    () =>
      isImportedAudioBook
        ? buildImportedAudioChapterSegments({
            title: bookTitle,
            fileName:
              hydratedBookMeta?.importedAudioFileName ??
              `${bookTitle}.${hydratedBookMeta?.importedAudioFormat ?? "mp3"}`,
            format: hydratedBookMeta?.importedAudioFormat ?? "mp3",
            durationSeconds: hydratedBookMeta?.importedAudioDurationSeconds ?? null,
          })
        : [],
    [
      bookTitle,
      hydratedBookMeta?.importedAudioDurationSeconds,
      hydratedBookMeta?.importedAudioFileName,
      hydratedBookMeta?.importedAudioFormat,
      isImportedAudioBook,
    ],
  );
  const displayNarratorName = isImportedAudioBook ? "Original audio" : narratorName;
  const displayMode = isImportedAudioBook
    ? hydratedBookMeta?.importedAudioFormat?.toUpperCase() ?? "Imported file"
    : mode;
  const authorSpotlight = getAuthorSpotlight({
    bookId,
    title: bookTitle,
    genreLabel: hydratedBookMeta?.genreLabel ?? null,
  });
  const activeTastePreset =
    tastePresets.find(
      (preset) => preset.narratorId === narratorId && preset.mode === mode,
    ) ?? null;
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
  const importedAudioKind =
    isImportedAudioBook && importedAudioUrl ? "imported-audio" : null;
  const historicalArtifactId = searchParams.get("artifactId");
  const jumpChapterIndex = Number(searchParams.get("quoteChapter"));
  const jumpProgressSeconds = Number(searchParams.get("quoteProgress"));
  const initialJumpTarget =
    Number.isInteger(jumpChapterIndex) &&
    jumpChapterIndex >= 0 &&
    Number.isFinite(jumpProgressSeconds) &&
    jumpProgressSeconds >= 0
      ? {
          chapterIndex: jumpChapterIndex,
          progressSeconds: jumpProgressSeconds,
        }
      : null;
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
    importedAudioKind ??
    (historicalArtifactId && historicalArtifactKind
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
      );
  const audioUrl =
    importedAudioKind
      ? importedAudioUrl
      : historicalArtifactId && historicalArtifactKind
      ? `/api/audio/generated/artifacts/${historicalArtifactId}`
      : preferredAudioKind
        ? preferredAudioKind === "imported-audio"
          ? importedAudioUrl
          : `/api/audio/generated/${bookId}?kind=${preferredAudioKind}`
        : null;
  const playerChapters: Chapter[] =
    isImportedAudioBook && importedAudioChapters.length > 0
      ? importedAudioChapters
      : chapters.length > 0
      ? chapters
      : [
          {
            id: "chapter-empty",
            title: "No chapter loaded",
            text: "No imported draft found yet. Return to import and carry a chapter through setup first.",
            order: 0,
          },
      ];
  const importedAudioChapterStarts = isImportedAudioBook
    ? importedAudioChapters.map((chapter) => chapter.startSeconds)
    : null;
  const playerNextMove = preferredAudioKind === "imported-audio"
    ? {
        eyebrow: "Recommended next move",
        label: "Keep listening to your imported audiobook",
        detail:
          "This private audiobook file is already in the player, so the next useful move is simply to keep listening or resume from where you left off.",
        href: `/player/${bookId}`,
        cta: "Keep listening",
      }
    : preferredAudioKind === "full-book-generation"
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
  const playerFollowUp = preferredAudioKind === "imported-audio"
    ? {
        eyebrow: "After that",
        label: "Bring in another private audiobook",
        detail:
          "Use the same local import path for the next MP3 or M4B file you want on your shelf.",
        href: "/import?source=audio",
        cta: "Import another audiobook",
      }
    : fullBookIsReady || sampleIsReady
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
    label:
      preferredAudioKind === "imported-audio"
        ? "Return to your library"
        : "Bring another title into the flow",
    detail:
      preferredAudioKind === "imported-audio"
        ? "Jump back home to see this audiobook alongside your other imports, circles, and listening memory."
        : "When this listening session is on track, jump back to import and bring the next book through the same taste-first workflow.",
    href: preferredAudioKind === "imported-audio" ? "/" : "/import",
    cta: preferredAudioKind === "imported-audio" ? "Back to home" : "Import another draft",
  };
  const playerLaunchpad: readonly ActionLaunchpadItem[] = [
    {
      id: "next-move",
      eyebrow: playerNextMove.eyebrow,
      label: playerNextMove.label,
      detail: playerNextMove.detail,
      cardClassName: "border-emerald-200 bg-emerald-50/80",
      action: (
        <Link
          className="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
          href={playerNextMove.href}
        >
          {playerNextMove.cta}
        </Link>
      ),
    },
    {
      id: "follow-up",
      eyebrow: playerFollowUp.eyebrow,
      label: playerFollowUp.label,
      detail: playerFollowUp.detail,
      cardClassName: "border-sky-200 bg-sky-50/80",
      action: (
        <Link
          className="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
          href={playerFollowUp.href}
        >
          {playerFollowUp.cta}
        </Link>
      ),
    },
    {
      id: "support",
      eyebrow: playerSupport.eyebrow,
      label: playerSupport.label,
      detail: playerSupport.detail,
      action: (
        <Link
          className="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
          href={playerSupport.href}
        >
          {playerSupport.cta}
        </Link>
      ),
    },
  ] as const;
  useEffect(() => {
    if (!isImportedAudioBook) {
      return;
    }

    let cancelled = false;
    let nextUrl: string | null = null;

    async function hydrateImportedAudio() {
      const url = await readImportedAudioAssetUrl(bookId).catch(() => null);
      if (cancelled) {
        if (url) {
          URL.revokeObjectURL(url);
        }
        return;
      }

      nextUrl = url;
      setImportedAudioUrl(url);
    }

    void hydrateImportedAudio();

    return () => {
      cancelled = true;
      if (nextUrl) {
        URL.revokeObjectURL(nextUrl);
      }
    };
  }, [bookId, isImportedAudioBook]);

  useEffect(() => {
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

      if (
        syncedBook &&
        getUpdatedAtWeight(syncedBook.updatedAt) >=
          getUpdatedAtWeight(hydratedBookMeta?.updatedAt)
      ) {
        setHydratedBookMeta(syncedBook);
      }
    }

    void hydrateBookMetaFromBackend();

    return () => {
      cancelled = true;
    };
  }, [bookId, hydratedBookMeta?.updatedAt]);

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

      const shouldPreferBackendSavedTaste =
        backendTaste.source === "saved" &&
        (
          resolvedTaste.source !== "saved" ||
          resolvedTaste.profile?.narratorId !== backendTaste.profile.narratorId ||
          resolvedTaste.profile?.mode !== backendTaste.profile.mode
        );
      const shouldHydrateMissingTaste =
        resolvedTaste.source === "none" &&
        (backendTaste.source === "default" || backendTaste.source === "recent");

      if (!shouldPreferBackendSavedTaste && !shouldHydrateMissingTaste) {
        return;
      }

      setResolvedTaste(backendTaste);
    }

    void hydrateTasteFromBackend();

    return () => {
      cancelled = true;
    };
  }, [
    bookId,
    resolvedTaste.profile?.mode,
    resolvedTaste.profile?.narratorId,
    resolvedTaste.source,
  ]);

  useEffect(() => {
    if (hydratedRemovedBook || !draftText) {
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
      const preferredPlaybackState = resolvePreferredPlaybackState(
        hydratedPlaybackState,
        syncedPlayback,
      );

      if (
        preferredPlaybackState &&
        preferredPlaybackState !== hydratedPlaybackState
      ) {
        setHydratedPlaybackState(preferredPlaybackState);
        writePersistedPlaybackState(bookId, preferredPlaybackState);
      }

      if (syncedPlaybackDefaults && !hydratedPlaybackDefaults) {
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

      const preferredSampleOutput = resolvePreferredGenerationOutput(
        sampleOutput,
        backendSampleOutput,
      );
      const preferredFullBookOutput = resolvePreferredGenerationOutput(
        fullBookOutput,
        backendFullBookOutput,
      );

      if (
        preferredSampleOutput &&
        preferredSampleOutput.generatedAt !== sampleOutput?.generatedAt
      ) {
        writeLocalGenerationOutput(preferredSampleOutput);
        setSampleOutput(preferredSampleOutput);
      }

      if (
        preferredFullBookOutput &&
        preferredFullBookOutput.generatedAt !== fullBookOutput?.generatedAt
      ) {
        writeLocalGenerationOutput(preferredFullBookOutput);
        setFullBookOutput(preferredFullBookOutput);
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
    <AppShell eyebrow="Player" title="Listen to your book">
      <ExperienceModeToggle
        detail="Everyday keeps playback focused on the book, your place, and the next simple action. Studio reveals compare mode and deeper system context."
        mode={experienceMode}
        onModeChange={setExperienceMode}
        title="Keep playback simple or open advanced controls"
      />
      <section className="rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#fffefb_0%,#ffffff_42%,#eef4ff_100%)] p-6 shadow-[0_24px_70px_-46px_rgba(28,25,23,0.42)]">
        <StateSummaryPanel
          label={preferredAudioKind ? "Playback is ready" : "Playback needs audio first"}
          detail={
            preferredAudioKind
              ? `You are on the listening screen for ${bookTitle}. Keep listening here, or return to setup only if you want to change how the book sounds.`
              : "This book needs a generated sample, a full-book render, or an imported audio file before playback can start."
          }
          action={
            preferredAudioKind
              ? "Press play and keep going"
              : "Go back to setup and generate audio"
          }
          actionLabel="Best next step"
          sectionLabel="Now playing"
          statsClassName="mt-5 grid gap-3 md:grid-cols-[1.15fr_0.85fr_0.85fr]"
        >
          <BookIdentityCard
            title={bookTitle}
            subtitle={`${playerChapters.length} chapter${playerChapters.length === 1 ? "" : "s"} in this listening session`}
            fallbackLabel="Playback"
            coverTheme={hydratedBookMeta?.coverTheme}
            coverLabel={hydratedBookMeta?.coverLabel}
            coverGlyph={hydratedBookMeta?.coverGlyph}
            genreLabel={hydratedBookMeta?.genreLabel}
          />
          <article className="rounded-[1.5rem] border border-stone-200/80 bg-white/85 p-4 shadow-sm">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
              Render type
            </p>
            <p className="mt-2 text-lg font-semibold text-stone-950">
              {historicalArtifactId && renderState === "archived"
                ? "Archived render"
                : preferredAudioKind === "imported-audio"
                  ? "Imported audiobook"
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
              {displayNarratorName} in {displayMode}
            </p>
          </article>
        </StateSummaryPanel>
        {experienceMode === "studio" && preferredAudioKind !== "imported-audio" ? (
        <div className="mt-5 rounded-[1.5rem] border border-stone-200/80 bg-white/85 p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
                Quick taste presets
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Switch the player into a known listening personality without going back
                to setup.
              </p>
            </div>
            <div className="rounded-[1.1rem] border border-stone-200 bg-stone-50 px-4 py-3 shadow-sm">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-stone-500">
                Active preset
              </p>
              <p className="mt-2 text-base font-semibold text-stone-950">
                {activeTastePreset?.title ?? "Custom mix"}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {tastePresets.map((preset) => {
              const isActive = activeTastePreset?.id === preset.id;
              return (
                <Link
                  key={preset.id}
                  className={`rounded-[1.3rem] border px-4 py-4 shadow-sm transition ${
                    isActive
                      ? "border-stone-950 bg-[linear-gradient(135deg,#fff8ed_0%,#f5eee0_100%)] shadow-[0_18px_36px_-30px_rgba(41,37,36,0.55)]"
                      : "border-stone-200 bg-stone-50/70 hover:border-stone-300 hover:bg-white"
                  }`}
                  href={`/player/${bookId}?artifact=${preferredAudioKind === "full-book-generation" ? "full" : "sample"}&narrator=${preset.narratorId}&mode=${preset.mode}&renderState=current`}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-base font-semibold text-stone-950">
                      {preset.title}
                    </span>
                    {isActive ? (
                      <span className="rounded-full bg-stone-950 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white">
                        Active
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{preset.detail}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                    <span className="rounded-full bg-stone-100 px-2.5 py-1">
                      {narratorNames[preset.narratorId] ?? preset.narratorId}
                    </span>
                    <span className="rounded-full bg-stone-100 px-2.5 py-1 capitalize">
                      {preset.mode}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
        ) : null}
      </section>
      {experienceMode === "studio" ? (
        <AuthorSpotlightCard spotlight={authorSpotlight} />
      ) : null}
      {experienceMode === "studio" && sampleIsReady && fullBookIsReady ? (
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
        chapterStartSeconds={importedAudioChapterStarts}
        totalAudioDurationSeconds={hydratedBookMeta?.importedAudioDurationSeconds ?? null}
        initialJumpTarget={initialJumpTarget}
        initialPlaybackDefaults={hydratedPlaybackDefaults}
        initialPlaybackState={hydratedPlaybackState}
        mode={displayMode}
        narratorName={displayNarratorName}
        playbackIsReady={Boolean(audioUrl)}
      />
      <section className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm">
        {experienceMode === "studio" ? (
          <>
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
          </>
        ) : null}
        {experienceMode === "studio" ? (
          <ActionLaunchpad className="mb-5 grid gap-4 lg:grid-cols-3" items={playerLaunchpad} />
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
          {experienceMode === "studio" ? (
            <Link
              className="rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700"
              href="/#default-taste"
            >
              Manage default taste
            </Link>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
