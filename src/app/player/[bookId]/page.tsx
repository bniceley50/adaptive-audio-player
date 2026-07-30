"use client";

import Link from "next/link";
import { use, useEffect, useEffectEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/shared/app-shell";
import { NowPlaying } from "@/components/player/now-playing";
import type { PublicGenerationOutputSummary } from "@/lib/backend/types";
import { getBook, type BookDetail } from "@/lib/client/books-api";
import {
  readLocalLibraryBook,
  upsertLocalLibraryBook,
} from "@/lib/library/local-library";
import {
  readPlaybackDefaults,
  readPersistedPlaybackState,
  type PlaybackDefaults,
} from "@/lib/playback/local-playback";
import { resolvePlaybackSource } from "@/lib/playback/resolve-playback-source";
import { parseChapters } from "@/lib/parser/parse-chapters";
import type { Chapter } from "@/lib/types/models";
import { VOICE_DISPLAY_NAMES } from "@/lib/voices/catalog";

interface PlayerPageProps {
  params: Promise<{ bookId: string }>;
}

interface BookJobsPayload {
  artifacts?: PublicGenerationOutputSummary[];
  outputs?: PublicGenerationOutputSummary[];
}

const secondaryActionClass =
  "rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-800 transition hover:border-stone-400 hover:bg-stone-50";

export default function PlayerPage({ params }: PlayerPageProps) {
  const { bookId } = use(params);
  const searchParams = useSearchParams();
  const [draftText, setDraftText] = useState("");
  const [hydratedBookMeta, setHydratedBookMeta] = useState<
    ReturnType<typeof readLocalLibraryBook>
  >(null);
  const bookTitle = hydratedBookMeta?.title ?? `Book ${bookId}`;
  const [hydratedPlaybackState, setHydratedPlaybackState] = useState<
    ReturnType<typeof readPersistedPlaybackState>
  >(null);
  const [hydratedPlaybackDefaults, setHydratedPlaybackDefaults] =
    useState<PlaybackDefaults | null>(null);
  const [currentOutputs, setCurrentOutputs] = useState<
    PublicGenerationOutputSummary[]
  >([]);
  const [artifactHistory, setArtifactHistory] = useState<
    PublicGenerationOutputSummary[]
  >([]);
  const [recoveryState, setRecoveryState] = useState<
    "idle" | "recovering" | "missing"
  >("recovering");

  const chapters = useMemo(() => parseChapters(draftText), [draftText]);
  const historicalArtifactId = searchParams.get("artifactId");
  const requestedKind =
    searchParams.get("artifact") === "sample"
      ? "sample-generation"
      : searchParams.get("artifact") === "full"
        ? "full-book-generation"
        : null;
  const playbackSource = resolvePlaybackSource({
    artifacts: artifactHistory,
    bookId,
    currentOutputs,
    narratorNames: VOICE_DISPLAY_NAMES,
    persistedKind: hydratedPlaybackState?.playbackArtifactKind ?? null,
    requestedArtifactId: historicalArtifactId,
    requestedKind,
  });
  const preferredAudioKind = playbackSource.artifactKind;
  const audioUrl = playbackSource.audioUrl;
  const displayNarratorName = playbackSource.narratorName;
  const jumpChapterParam = searchParams.get("quoteChapter");
  const jumpProgressParam = searchParams.get("quoteProgress");
  const jumpChapterIndex = Number(jumpChapterParam);
  const jumpProgressSeconds = Number(jumpProgressParam);
  const initialJumpTarget =
    jumpChapterParam !== null &&
    jumpProgressParam !== null &&
    Number.isInteger(jumpChapterIndex) &&
    jumpChapterIndex >= 0 &&
    Number.isFinite(jumpProgressSeconds) &&
    jumpProgressSeconds >= 0
      ? {
          chapterIndex: jumpChapterIndex,
          progressSeconds: jumpProgressSeconds,
        }
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
  useEffect(() => {
    // Browser persistence is an external store and can only be synchronized
    // after the server-rendered recovery shell has hydrated.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftText("");
    setHydratedBookMeta(readLocalLibraryBook(bookId));
    setHydratedPlaybackState(readPersistedPlaybackState(bookId));
    setHydratedPlaybackDefaults(readPlaybackDefaults());
    setRecoveryState("recovering");
  }, [bookId]);

  const applyPlayerData = useEffectEvent(
    (book: BookDetail | null, jobsPayload: BookJobsPayload | null) => {
      const backendOutputs = jobsPayload?.outputs ?? [];

      setCurrentOutputs(backendOutputs);
      setArtifactHistory(jobsPayload?.artifacts ?? []);

      if (!book) {
        setRecoveryState("missing");
        return;
      }

      const bookMetadata = {
        ...readLocalLibraryBook(book.bookId),
        bookId: book.bookId,
        title: book.title,
        chapterCount: book.chapterCount,
        updatedAt: book.updatedAt,
      };
      upsertLocalLibraryBook(bookMetadata);
      setHydratedBookMeta(bookMetadata);
      setDraftText(book.manuscript);
      setRecoveryState("idle");
    },
  );

  useEffect(() => {
    const abortController = new AbortController();

    async function loadPlayerData() {
      const [book, jobsResponse] = await Promise.all([
        getBook(bookId, { signal: abortController.signal }).catch(() => null),
        fetch(`/api/jobs/book/${encodeURIComponent(bookId)}`, {
          cache: "no-store",
          credentials: "same-origin",
          headers: { accept: "application/json" },
          signal: abortController.signal,
        }).catch(() => null),
      ]);
      const jobsPayload = jobsResponse?.ok
        ? await (jobsResponse.json().catch(() => null) as Promise<BookJobsPayload | null>)
        : null;

      if (!abortController.signal.aborted) {
        applyPlayerData(book, jobsPayload);
      }
    }

    void loadPlayerData();

    return () => {
      abortController.abort();
    };
  }, [bookId]);

  if (!draftText && recoveryState === "recovering") {
    return (
      <AppShell variant="player" title="Restoring...">
        <section className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-stone-950">
            Restoring this book from your private library
          </h2>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            This player opened before the saved book was ready, so the app is
            recovering its chapters and playback context.
          </p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell variant="player" title={bookTitle}>
      <NowPlaying
        artifactId={
          playbackSource.version === "current" ? playbackSource.artifactId : null
        }
        audioKind={preferredAudioKind}
        audioUrl={audioUrl}
        bookId={bookId}
        bookTitle={bookTitle}
        chapters={playerChapters}
        initialJumpTarget={initialJumpTarget}
        initialPlaybackDefaults={hydratedPlaybackDefaults}
        initialPlaybackState={hydratedPlaybackState}
        narratorName={displayNarratorName}
        playbackIsReady={playbackSource.isReady}
      />
      <section className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <Link
            className={secondaryActionClass}
            href={`/books/${bookId}?from=player`}
          >
            Back to setup
          </Link>
          <Link
            className={secondaryActionClass}
            href="/import"
          >
            Import another draft
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
