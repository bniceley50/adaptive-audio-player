"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RemovedBookRecoveryCard } from "@/components/library/removed-book-recovery-card";
import { RetryJobButton } from "@/components/library/retry-job-button";
import {
  ActionLaunchpad,
  type ActionLaunchpadItem,
} from "@/components/shared/action-launchpad";
import { AppShell } from "@/components/shared/app-shell";
import { BookIdentityCard } from "@/components/shared/book-identity-card";
import { JourneyHero } from "@/components/shared/journey-hero";
import { RenderHistorySummary } from "@/components/shared/render-history-summary";
import { StateSummaryPanel } from "@/components/shared/state-summary-panel";
import {
  getUpdatedAtWeight,
  tastePresets,
} from "@/features/reader/shared-support";
import { restoreBookFromBackendSnapshot } from "@/lib/backend/client-restore";
import type {
  GenerationArtifactSummary,
  GenerationOutputSummary,
  SyncJobSummary,
} from "@/lib/backend/types";
import {
  describeListeningTasteSource,
  replaceRemovedLocalLibraryBooks,
  readLocalDraftText,
  readDefaultListeningProfile,
  readLocalLibraryBook,
  readLocalSampleRequest,
  readRemovedLocalLibraryBook,
  resolvePreferredGenerationOutput,
  resolveListeningTaste,
  writeDefaultListeningProfile,
  writeLocalGenerationOutput,
  writeLocalListeningProfile,
  writeLocalSampleRequest,
} from "@/lib/library/local-library";
import { parseChapters } from "@/lib/parser/parse-chapters";
import type { ListeningMode } from "@/lib/types/models";

interface BookPageProps {
  params: Promise<{ bookId: string }>;
}

const narratorOptions = [
  {
    id: "marlowe",
    name: "Marlowe",
    description: "Warm and cinematic for fiction-first listening.",
  },
  {
    id: "sloane",
    name: "Sloane",
    description: "Calm and steady for long listening sessions.",
  },
  {
    id: "jules",
    name: "Jules",
    description: "Conversational and bright for fast pacing.",
  },
];

export default function BookPage({ params }: BookPageProps) {
  const { bookId } = use(params);
  const router = useRouter();
  const [initialTaste] = useState(() =>
    typeof window !== "undefined"
      ? resolveListeningTaste(bookId)
      : { profile: null, source: "none" as const },
  );
  const [resolvedTaste, setResolvedTaste] = useState(initialTaste);
  const savedListeningProfile =
    resolvedTaste.source === "saved" ? resolvedTaste.profile : null;
  const [defaultListeningProfile, setDefaultListeningProfile] = useState(() =>
    typeof window !== "undefined" ? readDefaultListeningProfile() : null,
  );
  const initialListeningProfile = resolvedTaste.profile;
  const initialTasteMeta = describeListeningTasteSource(resolvedTaste);
  const [selectedNarrator, setSelectedNarrator] = useState(
    initialListeningProfile?.narratorId ?? (narratorOptions[0]?.id ?? "marlowe"),
  );
  const [selectedMode, setSelectedMode] = useState<ListeningMode>(
    (initialListeningProfile?.mode as ListeningMode | undefined) ?? "ambient",
  );
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
  const [recoveryState, setRecoveryState] = useState<
    "idle" | "recovering" | "missing"
  >(() =>
    !removedBook && !draftText ? "recovering" : "idle",
  );

  const chapters = useMemo(() => parseChapters(draftText), [draftText]);
  const selectedNarratorMeta =
    narratorOptions.find((narrator) => narrator.id === selectedNarrator) ??
    narratorOptions[0];
  const activeTastePreset =
    tastePresets.find(
      (preset) =>
        preset.narratorId === selectedNarrator && preset.mode === selectedMode,
    ) ?? null;
  const [generatedSample, setGeneratedSample] = useState<{
    bookId: string;
    narratorId: string;
    mode: ListeningMode;
  } | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    const request = readLocalSampleRequest();
    return request?.bookId === bookId
      ? {
          bookId: request.bookId,
          narratorId: request.narratorId,
          mode: request.mode as ListeningMode,
        }
      : null;
  });
  const [generationJob, setGenerationJob] = useState<SyncJobSummary | null>(null);
  const [fullBookJob, setFullBookJob] = useState<SyncJobSummary | null>(null);
  const [sampleOutput, setSampleOutput] = useState<GenerationOutputSummary | null>(null);
  const [fullBookOutput, setFullBookOutput] = useState<GenerationOutputSummary | null>(
    null,
  );
  const [artifactHistory, setArtifactHistory] = useState<GenerationArtifactSummary[]>([]);
  const sampleIsCurrent =
    (generatedSample?.bookId === bookId &&
      generatedSample.narratorId === selectedNarrator &&
      generatedSample.mode === selectedMode) ||
    (sampleOutput?.bookId === bookId &&
      sampleOutput.narratorId === selectedNarrator &&
      sampleOutput.mode === selectedMode);
  const sampleJobIsActive =
    generationJob?.status === "queued" || generationJob?.status === "running";
  const fullBookJobIsActive =
    fullBookJob?.status === "queued" || fullBookJob?.status === "running";
  const renderGroups = useMemo(() => {
    const currentRenders: GenerationArtifactSummary[] = [];
    const archivedRenders: GenerationArtifactSummary[] = [];

    for (const artifact of artifactHistory) {
      const isLatestForKind =
        (artifact.kind === "sample-generation" &&
          artifact.generatedAt === sampleOutput?.generatedAt) ||
        (artifact.kind === "full-book-generation" &&
          artifact.generatedAt === fullBookOutput?.generatedAt);

      if (isLatestForKind) {
        currentRenders.push(artifact);
      } else {
        archivedRenders.push(artifact);
      }
    }

    return {
      currentRenders,
      archivedRenders,
    };
  }, [artifactHistory, fullBookOutput?.generatedAt, sampleOutput?.generatedAt]);
  const setupStage = sampleJobIsActive
    ? {
        label: "Rendering sample",
        detail:
          "The backend is generating a preview for this narrator and mode. You can review chapters while it finishes.",
        action: "Watch generation status below",
      }
    : sampleIsCurrent && fullBookJobIsActive
      ? {
          label: "Rendering full book",
          detail:
            "The sample is approved for this setup and the full-book render is running in the backend.",
          action: "Track full-book generation below",
        }
      : fullBookOutput?.bookId === bookId
        ? {
            label: "Ready to listen",
            detail:
              "This setup already has a current full-book render, so the next move is listening or reviewing historical renders.",
            action: "Open the current full-book player",
          }
        : sampleIsCurrent
          ? {
              label: "Sample approved",
              detail:
                "This setup has a playable sample. The next move is to listen or generate the full book.",
              action: "Listen to the current sample or render the full book",
            }
          : {
              label: "Choose the taste",
              detail:
                "Lock the narrator and listening mode first. Once that feels right, generate a sample and move into playback.",
              action: "Generate the first sample from this setup",
            };
  const recommendedAction = sampleIsCurrent
    ? fullBookOutput?.bookId === bookId
      ? {
          label: "Listen to the current full book",
          detail:
            "The polished render is ready. Open the player and review the exact version listeners would hear.",
          href: `/player/${bookId}?artifact=full&renderState=current`,
        }
      : fullBookJobIsActive
        ? {
            label: "Track the full-book render",
            detail:
              "Your approved sample is already promoting into a full-book render. Keep an eye on the queue while it finishes.",
            href: "/jobs",
          }
        : {
            label: "Listen to the sample first",
            detail:
              "Validate the generated sample before committing more generation time to the full-book render.",
            href: `/player/${bookId}?narrator=${selectedNarrator}&mode=${selectedMode}&artifact=sample&renderState=current`,
          }
    : sampleJobIsActive
      ? {
          label: "Watch the sample render finish",
          detail:
            "The worker is already building this taste. The next useful move is to track status until the preview is ready.",
          href: "/jobs",
        }
      : {
          label: "Generate the first sample",
          detail:
            "Lock this narrator and mode into a concrete listening preview before you move into playback or full-book rendering.",
          action: "generate-sample" as const,
        };
  const followUpAction = sampleIsCurrent
    ? fullBookOutput?.bookId === bookId
      ? {
          label: "Review the render timeline",
          detail:
            "Current and archived renders stay separated below so you can compare what is live versus what is preserved.",
          href: "#render-history",
        }
      : fullBookJobIsActive
        ? {
            label: "Keep the render history tidy",
            detail:
              "Once the full book finishes, this book screen becomes the best place to compare current versus archived renders.",
            href: "#render-history",
          }
        : {
            label: "Promote the sample into a full book",
            detail:
              "Once the sample feels right, queue the full-book render so listening can move beyond the preview.",
            action: "generate-full-book" as const,
          }
    : sampleJobIsActive
      ? {
          label: "Prepare the default taste",
          detail:
            "If this setup feels like your long-term default, save it now so future imports start from the same voice direction.",
          action: "save-default" as const,
        }
      : {
          label: "Save this as your default taste",
          detail:
            "If this narrator and mode feel right for your library, make them the default before you import the next book.",
          action: "save-default" as const,
        };
  const supportAction = {
    label: "Keep the story moving",
    detail:
      "This page is your control tower: generate, listen, compare renders, and then jump back to import whenever you are ready for the next title.",
    href: "/import",
  };
  const setupJourneyIndex = fullBookOutput?.bookId === bookId || fullBookJobIsActive
    ? 3
    : sampleIsCurrent || sampleJobIsActive
      ? 2
      : 1;
  const setupJourney = [
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
      detail: "Render and judge the preview",
    },
    {
      id: "full",
      label: "04",
      title: "Full book",
      detail: "Promote the approved version",
    },
  ] as const;

  const loadBookJobs = useCallback(async () => {
    const response = await fetch(`/api/jobs/book/${bookId}`).catch(() => null);
    const payload = response
      ? ((await response.json().catch(() => null)) as
          | {
              jobs?: SyncJobSummary[];
              outputs?: GenerationOutputSummary[];
              artifacts?: GenerationArtifactSummary[];
            }
          | null)
      : null;

    if (!payload?.jobs?.length && !payload?.outputs?.length && !payload?.artifacts?.length) {
      return;
    }

    const latestSampleJob =
      payload.jobs?.find((job) => job.kind === "sample-generation") ?? null;
    const latestFullBookJob =
      payload.jobs?.find((job) => job.kind === "full-book-generation") ?? null;
    const latestSampleOutput =
      payload.outputs?.find((output) => output.kind === "sample-generation") ?? null;
    const latestFullBookOutput =
      payload.outputs?.find((output) => output.kind === "full-book-generation") ?? null;

    if (latestSampleJob) {
      setGenerationJob(latestSampleJob);
    }

    if (latestFullBookJob) {
      setFullBookJob(latestFullBookJob);
    }

    if (latestSampleOutput) {
      setSampleOutput(latestSampleOutput);
      writeLocalGenerationOutput(latestSampleOutput);
      if (latestSampleOutput.narratorId && latestSampleOutput.mode) {
        writeLocalSampleRequest({
          bookId,
          narratorId: latestSampleOutput.narratorId,
          mode: latestSampleOutput.mode as ListeningMode,
        });
      }
    }

    if (latestFullBookOutput) {
      setFullBookOutput(latestFullBookOutput);
      writeLocalGenerationOutput(latestFullBookOutput);
    }

    if (payload.artifacts?.length) {
      setArtifactHistory(payload.artifacts);
    }
  }, [bookId]);

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
        window.location.assign(`/books/${bookId}`);
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

      if (snapshot.defaultListeningProfile) {
        setDefaultListeningProfile(snapshot.defaultListeningProfile);
      }

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
      setSelectedNarrator(backendTaste.profile.narratorId);
      setSelectedMode(backendTaste.profile.mode as ListeningMode);
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

  useEffect(() => {
    if (!generationJob || generationJob.status === "completed" || generationJob.status === "failed") {
      return;
    }

    const jobId = generationJob.id;
    let cancelled = false;

    async function pollJob() {
      const response = await fetch(`/api/jobs/sample-generation/${jobId}`).catch(
        () => null,
      );
      const payload = response
        ? ((await response.json().catch(() => null)) as
            | { job?: SyncJobSummary }
            | null)
        : null;

      if (cancelled || !payload?.job) {
        return;
      }

      setGenerationJob(payload.job);

      if (payload.job.status === "completed") {
        const request = {
          bookId,
          narratorId: selectedNarrator,
          mode: selectedMode,
        };
        writeLocalSampleRequest(request);
        setGeneratedSample(request);
        setSampleOutput({
          workspaceId: payload.job.workspaceId,
          bookId,
          kind: "sample-generation",
          narratorId: selectedNarrator,
          mode: selectedMode,
          chapterCount: chapters.length,
          assetPath: "",
          mimeType: "audio/wav",
          provider: "mock",
          generatedAt: payload.job.completedAt ?? new Date().toISOString(),
        });
        writeLocalGenerationOutput({
          workspaceId: payload.job.workspaceId,
          bookId,
          kind: "sample-generation",
          narratorId: selectedNarrator,
          mode: selectedMode,
          chapterCount: chapters.length,
          assetPath: "",
          mimeType: "audio/wav",
          provider: "mock",
          generatedAt: payload.job.completedAt ?? new Date().toISOString(),
        });
        await loadBookJobs();
      }
    }

    const timer = window.setTimeout(() => {
      void pollJob();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    bookId,
    chapters.length,
    generationJob,
    loadBookJobs,
    selectedMode,
    selectedNarrator,
  ]);

  useEffect(() => {
    if (!fullBookJob || fullBookJob.status === "completed" || fullBookJob.status === "failed") {
      return;
    }

    const jobId = fullBookJob.id;
    let cancelled = false;

    async function pollJob() {
      const response = await fetch(`/api/jobs/full-book-generation/${jobId}`).catch(
        () => null,
      );
      const payload = response
        ? ((await response.json().catch(() => null)) as
            | { job?: SyncJobSummary }
            | null)
        : null;

      if (cancelled || !payload?.job) {
        return;
      }

      setFullBookJob(payload.job);
      if (payload.job.status === "completed") {
        setFullBookOutput({
          workspaceId: payload.job.workspaceId,
          bookId,
          kind: "full-book-generation",
          narratorId: payload.job.narratorId,
          mode: payload.job.mode,
          chapterCount: payload.job.chapterCount,
          assetPath: "",
          mimeType: "audio/wav",
          provider: "mock",
          generatedAt: payload.job.completedAt ?? new Date().toISOString(),
        });
        writeLocalGenerationOutput({
          workspaceId: payload.job.workspaceId,
          bookId,
          kind: "full-book-generation",
          narratorId: payload.job.narratorId,
          mode: payload.job.mode,
          chapterCount: payload.job.chapterCount,
          assetPath: "",
          mimeType: "audio/wav",
          provider: "mock",
          generatedAt: payload.job.completedAt ?? new Date().toISOString(),
        });
        await loadBookJobs();
      }
    }

    const timer = window.setTimeout(() => {
      void pollJob();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bookId, fullBookJob, loadBookJobs]);

  useEffect(() => {
    if (generationJob || fullBookJob) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadBookJobs();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [bookId, fullBookJob, generationJob, loadBookJobs]);

  async function generateSample() {
    const request: {
      bookId: string;
      narratorId: string;
      mode: ListeningMode;
    } = {
      bookId,
      narratorId: selectedNarrator,
      mode: selectedMode,
    };

    writeLocalSampleRequest(request);
    writeLocalListeningProfile({
      bookId,
      narratorId: selectedNarrator,
      narratorName: selectedNarratorMeta?.name ?? "Marlowe",
      mode: selectedMode,
    });
    const response = await fetch("/api/jobs/sample-generation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    }).catch(() => null);
    const payload = response
      ? ((await response.json().catch(() => null)) as
          | { job?: SyncJobSummary }
          | null)
      : null;
    setGeneratedSample(null);
    setGenerationJob(payload?.job ?? null);
  }

  async function queueFullBookGeneration() {
    const response = await fetch("/api/jobs/full-book-generation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        bookId,
        chapterCount: chapters.length,
      }),
    }).catch(() => null);

    const payload = response
      ? ((await response.json().catch(() => null)) as
          | { job?: SyncJobSummary }
          | null)
      : null;

    setFullBookJob(payload?.job ?? null);
  }

  function saveAsDefaultTaste() {
    const profile = {
      bookId,
      narratorId: selectedNarrator,
      narratorName: selectedNarratorMeta?.name ?? "Marlowe",
      mode: selectedMode,
    };

    writeDefaultListeningProfile(profile);
    setDefaultListeningProfile(profile);
  }
  const setupLaunchpad: readonly ActionLaunchpadItem[] = [
    {
      id: "recommended",
      eyebrow: "Recommended next move",
      label: recommendedAction.label,
      detail: recommendedAction.detail,
      cardClassName:
        "rounded-[1.6rem] border-amber-200/35 bg-[linear-gradient(135deg,rgba(252,211,77,0.16)_0%,rgba(255,255,255,0.08)_100%)]",
      eyebrowClassName:
        "text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-stone-300",
      titleClassName: "mt-3 text-lg font-semibold text-white",
      detailClassName: "mt-2 text-sm leading-6 text-stone-200",
      action:
        recommendedAction.href ? (
          <Link
            className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
            href={recommendedAction.href}
          >
            Open
          </Link>
        ) : recommendedAction.action === "generate-sample" ? (
          <button
            className="inline-flex rounded-full border border-amber-200/35 bg-amber-300 px-4 py-2 text-sm font-semibold text-stone-950 transition hover:bg-amber-200 disabled:bg-amber-200 disabled:text-stone-500"
            type="button"
            disabled={sampleJobIsActive}
            onClick={() => {
              void generateSample();
            }}
          >
            Generate first sample
          </button>
        ) : recommendedAction.action === "generate-full-book" ? (
          <button
            className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15 disabled:border-white/10 disabled:bg-transparent disabled:text-stone-400"
            type="button"
            disabled={!sampleIsCurrent || chapters.length === 0 || fullBookJobIsActive}
            onClick={() => {
              void queueFullBookGeneration();
            }}
          >
            Queue full book
          </button>
        ) : (
          <button
            className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
            type="button"
            onClick={saveAsDefaultTaste}
          >
            Set as library default
          </button>
        ),
    },
    {
      id: "after-that",
      eyebrow: "After that",
      label: followUpAction.label,
      detail: followUpAction.detail,
      cardClassName:
        "rounded-[1.6rem] border-sky-200/30 bg-[linear-gradient(135deg,rgba(125,211,252,0.14)_0%,rgba(255,255,255,0.06)_100%)]",
      eyebrowClassName:
        "text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-stone-300",
      titleClassName: "mt-3 text-lg font-semibold text-white",
      detailClassName: "mt-2 text-sm leading-6 text-stone-200",
      action:
        followUpAction.href ? (
          <Link
            className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
            href={followUpAction.href}
          >
            Open
          </Link>
        ) : followUpAction.action === "generate-full-book" ? (
          <button
            className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15 disabled:border-white/10 disabled:bg-transparent disabled:text-stone-400"
            type="button"
            disabled={!sampleIsCurrent || chapters.length === 0 || fullBookJobIsActive}
            onClick={() => {
              void queueFullBookGeneration();
            }}
          >
            Queue full book
          </button>
        ) : (
          <button
            className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
            type="button"
            onClick={saveAsDefaultTaste}
          >
            Set as library default
          </button>
        ),
    },
    {
      id: "keep-aligned",
      eyebrow: "Keep aligned",
      label: supportAction.label,
      detail: supportAction.detail,
      cardClassName:
        "rounded-[1.6rem] border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.04)_100%)]",
      eyebrowClassName:
        "text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-stone-300",
      titleClassName: "mt-3 text-lg font-semibold text-white",
      detailClassName: "mt-2 text-sm leading-6 text-stone-200",
      action: (
        <Link
          className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
          href={supportAction.href}
        >
          Open
        </Link>
      ),
    },
  ] as const;

  if (hydratedRemovedBook) {
    return (
      <AppShell eyebrow="Book setup" title={`${hydratedRemovedBook.book.title} needs recovery`}>
        <RemovedBookRecoveryCard removedBook={hydratedRemovedBook} returnHref="/" />
      </AppShell>
    );
  }

  if (!draftText && recoveryState === "recovering") {
    return (
      <AppShell eyebrow="Book setup" title="Restoring book">
        <section className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-stone-950">
            Restoring this book from your synced library
          </h2>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            This route opened without a local draft, so the app is pulling the book
            back from your account-linked workspace snapshot.
          </p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell eyebrow="Book setup" title={bookTitle}>
      <JourneyHero
        eyebrow="Journey"
        title="Import, shape, preview, then promote"
        detail="This setup screen is the middle of the audiobook workflow: lock the taste, validate it with a sample, then promote it into the full-book render when it feels right."
        currentIndex={setupJourneyIndex}
        currentTitle={setupJourney[setupJourneyIndex]?.title}
        steps={setupJourney}
      />
      <StateSummaryPanel
        label={setupStage.label}
        detail={setupStage.detail}
        action={setupStage.action}
        statsClassName="mt-5 grid gap-3 md:grid-cols-[1.15fr_0.85fr_0.85fr]"
      >
          <BookIdentityCard
            title={bookTitle}
            subtitle={`${chapters.length} parsed chapter${chapters.length === 1 ? "" : "s"}`}
            fallbackLabel="Setup"
            coverTheme={hydratedBookMeta?.coverTheme}
            coverLabel={hydratedBookMeta?.coverLabel}
            coverGlyph={hydratedBookMeta?.coverGlyph}
            genreLabel={hydratedBookMeta?.genreLabel}
          />
          <article className="rounded-[1.5rem] border border-stone-200/80 bg-white/85 p-4 shadow-sm">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
              Taste source
            </p>
            <p className="mt-2 text-lg font-semibold text-stone-950">
              {resolvedTaste.source === "saved"
                ? "Saved taste"
                : resolvedTaste.source === "default"
                  ? "Default taste"
                  : resolvedTaste.source === "recent"
                    ? "Latest taste"
                    : "New setup"}
            </p>
          </article>
          <article className="rounded-[1.5rem] border border-stone-200/80 bg-white/85 p-4 shadow-sm">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
              Active choice
            </p>
            <p className="mt-2 text-lg font-semibold text-stone-950">
              {selectedNarratorMeta?.name} in {selectedMode}
            </p>
          </article>
      </StateSummaryPanel>
      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(180deg,#fffefb_0%,#ffffff_100%)] shadow-[0_22px_60px_-42px_rgba(28,25,23,0.45)]">
          <div className="border-b border-stone-200/80 bg-[linear-gradient(135deg,#f7ecd8_0%,#fffdf7_48%,#eef4ff_100%)] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
                  Voice design
                </p>
                <h2 className="mt-2 text-xl font-semibold text-stone-950">
                  Choose narrator
                </h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Shape the book&apos;s identity first. A strong narrator choice makes
                  the sample feel deliberate before deeper controls exist.
                </p>
              </div>
              <div className="min-w-[12rem] rounded-[1.4rem] border border-white/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-stone-500">
                  Current voice
                </p>
                <p className="mt-2 text-lg font-semibold text-stone-950">
                  {selectedNarratorMeta?.name}
                </p>
                <p className="mt-1 text-sm text-stone-600">
                  {chapters.length} parsed chapter{chapters.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-5 p-6">
            <div className="rounded-[1.5rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-2xl">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
                    Quick starts
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-stone-950">
                    Pick a taste preset
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    Start from a ready-made listening personality, then fine-tune the
                    narrator and mood below if you want something custom.
                  </p>
                </div>
                <div className="rounded-[1.2rem] border border-stone-200 bg-white px-4 py-3 shadow-sm">
                  <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-stone-500">
                    Active preset
                  </p>
                  <p className="mt-2 text-base font-semibold text-stone-950">
                    {activeTastePreset?.title ?? "Custom mix"}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {tastePresets.map((preset) => {
                  const isActive = activeTastePreset?.id === preset.id;
                  return (
                    <button
                      key={preset.id}
                      className={`rounded-[1.4rem] border px-4 py-4 text-left shadow-sm transition ${
                        isActive
                          ? "border-stone-950 bg-[linear-gradient(135deg,#fff8ed_0%,#f5eee0_100%)] shadow-[0_20px_40px_-32px_rgba(41,37,36,0.65)]"
                          : "border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50/70"
                      }`}
                      type="button"
                      onClick={() => {
                        setSelectedNarrator(preset.narratorId);
                        setSelectedMode(preset.mode);
                      }}
                    >
                      <span className="flex flex-wrap items-center gap-3">
                        <span className="text-base font-semibold text-stone-950">
                          {preset.title}
                        </span>
                        {isActive ? (
                          <span className="rounded-full bg-stone-950 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white">
                            Active
                          </span>
                        ) : null}
                      </span>
                      <p className="mt-2 text-sm leading-6 text-stone-600">
                        {preset.detail}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                        <span className="rounded-full bg-stone-100 px-2.5 py-1">
                          {narratorOptions.find((narrator) => narrator.id === preset.narratorId)
                            ?.name ?? preset.narratorId}
                        </span>
                        <span className="rounded-full bg-stone-100 px-2.5 py-1 capitalize">
                          {preset.mode}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            {resolvedTaste.source !== "none" ? (
              <div className="rounded-[1.5rem] border border-stone-200 bg-[linear-gradient(180deg,#faf8f4_0%,#ffffff_100%)] px-4 py-4 text-sm text-stone-800 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-stone-900 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-white">
                    {resolvedTaste.source === "saved"
                      ? "Saved taste"
                      : resolvedTaste.source === "default"
                        ? "Default taste"
                        : "Latest taste"}
                  </span>
                  <p className="font-medium text-stone-950">
                    {resolvedTaste.source === "saved" && savedListeningProfile
                      ? `This book is using its saved taste: ${savedListeningProfile.narratorName} in ${savedListeningProfile.mode}.`
                      : resolvedTaste.source === "default" && defaultListeningProfile
                        ? `This new book is starting from your default taste: ${defaultListeningProfile.narratorName} in ${defaultListeningProfile.mode}.`
                        : resolvedTaste.source === "recent" && initialListeningProfile
                          ? `No default is saved, so this book is starting from your latest taste: ${initialListeningProfile.narratorName} in ${initialListeningProfile.mode}.`
                          : ""}
                  </p>
                </div>
                <p className="mt-3 text-stone-600">{initialTasteMeta.detail}</p>
                <p className="mt-2 text-stone-500">{initialTasteMeta.actionHint}</p>
              </div>
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-stone-300 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] px-4 py-4 text-sm text-stone-700">
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-stone-200 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-700">
                    Setup pending
                  </span>
                  <p className="font-medium text-stone-950">
                    No listening taste is attached to this book yet.
                  </p>
                </div>
                <p className="mt-3">{initialTasteMeta.detail}</p>
              </div>
            )}
            <div className="grid gap-3">
              {narratorOptions.map((narrator) => (
                <label
                  key={narrator.id}
                  className={`group relative flex cursor-pointer items-start gap-4 overflow-hidden rounded-[1.5rem] border p-4 shadow-sm transition ${
                    selectedNarrator === narrator.id
                      ? "border-stone-950 bg-[linear-gradient(135deg,#fffdf8_0%,#f5eee0_100%)] shadow-[0_22px_45px_-38px_rgba(41,37,36,0.7)]"
                      : "border-stone-200 bg-stone-50/70 hover:border-stone-300 hover:bg-white"
                  }`}
                >
                  <div
                    className={`absolute inset-y-0 left-0 w-1.5 transition ${
                      selectedNarrator === narrator.id
                        ? "bg-stone-950"
                        : "bg-transparent group-hover:bg-stone-300"
                    }`}
                  />
                  <input
                    checked={selectedNarrator === narrator.id}
                    className="mt-1"
                    name="narrator"
                    type="radio"
                    value={narrator.id}
                    onChange={() => setSelectedNarrator(narrator.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-3">
                      <span className="block text-lg font-semibold text-stone-900">
                        {narrator.name}
                      </span>
                      {selectedNarrator === narrator.id ? (
                        <span className="rounded-full bg-stone-900 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-white">
                          Selected
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-2 block text-sm leading-6 text-stone-600">
                      {narrator.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </article>

        <article className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(180deg,#fffdfa_0%,#ffffff_100%)] shadow-[0_22px_60px_-42px_rgba(28,25,23,0.45)]">
          <div className="border-b border-stone-200/80 bg-[linear-gradient(135deg,#edf4ff_0%,#fffdf7_100%)] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-xl">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
                  Playback mood
                </p>
                <h2 className="mt-2 text-xl font-semibold text-stone-950">
                  Listening mode
                </h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Decide whether this book should feel pristine, atmospheric, or
                  cinematic before you render the first sample.
                </p>
              </div>
              <div className="min-w-[10rem] rounded-[1.4rem] border border-white/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-stone-500">
                  Selected mode
                </p>
                <p className="mt-2 text-lg font-semibold capitalize text-stone-950">
                  {selectedMode}
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-4 p-6">
            <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50/80 px-4 py-4 text-sm leading-6 text-stone-600">
              The mode controls the listening atmosphere that wraps around narration.
              You can always switch later, but locking the mood here makes the first
              sample feel intentional.
            </div>
            <div className="grid gap-3">
              {(["classic", "ambient", "immersive"] as ListeningMode[]).map((mode) => (
                <button
                  key={mode}
                  className={`rounded-[1.5rem] border px-4 py-4 text-left shadow-sm transition ${
                    selectedMode === mode
                      ? "border-stone-950 bg-[linear-gradient(135deg,#1c1917_0%,#44403c_100%)] text-white shadow-[0_24px_45px_-34px_rgba(28,25,23,0.85)]"
                      : "border-stone-200 bg-stone-50/70 text-stone-900 hover:border-stone-300 hover:bg-white"
                  }`}
                  type="button"
                  onClick={() => setSelectedMode(mode)}
                >
                  <span className="flex flex-wrap items-center gap-3">
                    <span className="block text-lg font-semibold capitalize">{mode}</span>
                    {selectedMode === mode ? (
                      <span className="rounded-full bg-white/15 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-white">
                        Active
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`mt-2 block text-sm leading-6 ${
                      selectedMode === mode ? "text-stone-200" : "text-stone-600"
                    }`}
                  >
                    {mode === "classic"
                      ? "Clean narration only."
                      : mode === "ambient"
                        ? "Subtle scene-aware atmosphere."
                        : "Richer mood and sound layering."}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <article className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(145deg,#111827_0%,#1c1917_45%,#292524_100%)] p-6 text-white shadow-[0_28px_80px_-46px_rgba(17,24,39,0.9)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <p className="text-sm uppercase tracking-[0.24em] text-stone-300">
                Sample summary
              </p>
              <h2 className="mt-3 text-3xl font-semibold">
                {selectedNarratorMeta?.name} in {selectedMode}
              </h2>
              <p className="mt-3 text-sm leading-6 text-stone-300">
                Generate the sample for this exact narrator and mode before opening
                the player. Changing either choice will make the current sample stale.
              </p>
            </div>
            <div className="min-w-[12rem] rounded-[1.5rem] border border-white/15 bg-white/8 px-4 py-4 shadow-sm backdrop-blur">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-300">
                Setup readiness
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {sampleIsCurrent
                  ? "Ready to play"
                  : generationJob?.status === "queued" || generationJob?.status === "running"
                    ? "Rendering sample"
                    : "Needs generation"}
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-300">
                {sampleIsCurrent
                  ? "This exact setup already has a playable sample."
                  : "Lock this narrator and mode into a real preview before listening."}
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.4rem] border border-white/10 bg-white/8 p-4 shadow-sm">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-300">
                Narrator
              </p>
              <p className="mt-2 text-lg font-semibold text-white">{selectedNarratorMeta?.name}</p>
            </div>
            <div className="rounded-[1.4rem] border border-white/10 bg-white/8 p-4 shadow-sm">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-300">
                Listening mode
              </p>
              <p className="mt-2 text-lg font-semibold capitalize text-white">{selectedMode}</p>
            </div>
          </div>
          <div className="mt-4 rounded-[1.6rem] border border-emerald-200/30 bg-[linear-gradient(135deg,rgba(16,185,129,0.16)_0%,rgba(255,255,255,0.06)_100%)] p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-emerald-200/40 bg-white/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-emerald-200">
                    Current state
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-200">
                    {setupStage.label}
                  </span>
                </div>
                <p className="mt-3 text-base font-medium text-white">{setupStage.detail}</p>
                <p className="mt-2 text-sm leading-6 text-stone-300">
                  Next move: {setupStage.action}.
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-white/10 bg-black/10 px-4 py-4 text-right shadow-sm">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-stone-300">
                  Fastest path
                </p>
                <p className="mt-2 text-sm font-medium text-white">
                  {sampleIsCurrent
                    ? fullBookOutput?.bookId === bookId
                      ? "Open the full book player"
                      : fullBookJobIsActive
                        ? "Track the full-book render"
                        : "Listen to the sample or queue the full book"
                    : sampleJobIsActive
                      ? "Wait for the sample render"
                      : "Generate the sample first"}
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <article className="rounded-[1.25rem] border border-white/10 bg-white/6 px-4 py-3">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-stone-300">
                  1. Hear the sample
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-200">
                  Validate the exact narrator and listening mode before committing more generation.
                </p>
              </article>
              <article className="rounded-[1.25rem] border border-white/10 bg-white/6 px-4 py-3">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-stone-300">
                  2. Promote the render
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-200">
                  Queue the full-book pass only when this sample feels like the right taste.
                </p>
              </article>
              <article className="rounded-[1.25rem] border border-white/10 bg-white/6 px-4 py-3">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-stone-300">
                  3. Keep the history
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-200">
                  Every sample and full-book render stays reviewable in the render timeline below.
                </p>
              </article>
            </div>
          </div>
          <div className="mt-4 space-y-3 rounded-[1.6rem] border border-white/10 bg-white/8 p-5">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-stone-300">Parsed chapters</span>
              <span className="font-medium text-white">{chapters.length}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-stone-300">Sample status</span>
              <span className="font-medium text-white">
                {sampleIsCurrent
                  ? "Generated for this setup"
                  : sampleOutput?.bookId === bookId
                    ? "Generated for a different setup"
                  : generationJob?.status === "queued"
                    ? "Queued on backend"
                  : generationJob?.status === "running"
                    ? "Generating on backend"
                    : "Not generated yet"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-stone-300">Full book status</span>
              <span className="font-medium text-white">
                {fullBookOutput?.bookId === bookId
                  ? "Generated on backend"
                  : fullBookJob?.status === "completed"
                    ? "Queued and completed on backend"
                  : fullBookJob?.status === "queued"
                    ? "Queued on backend"
                  : fullBookJob?.status === "running"
                    ? "Generating on backend"
                    : "Not queued yet"}
              </span>
            </div>
          </div>
          <ActionLaunchpad className="mt-6 grid gap-4 lg:grid-cols-3" items={setupLaunchpad} />
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-stone-950 shadow-[0_20px_40px_-30px_rgba(252,211,77,0.85)] disabled:bg-amber-200 disabled:text-stone-500"
              type="button"
              disabled={sampleJobIsActive}
              onClick={() => {
                void generateSample();
              }}
            >
              {generationJob?.status === "running"
                ? "Generating sample…"
                : generationJob?.status === "queued"
                  ? "Sample queued…"
                  : "Generate sample"}
            </button>
            <button
              className="rounded-full border border-white/20 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
              type="button"
              onClick={saveAsDefaultTaste}
            >
              Save as default taste
            </button>
            <button
              className="rounded-full border border-white/20 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:border-white/10 disabled:bg-transparent disabled:text-stone-400"
              type="button"
              disabled={!sampleIsCurrent || chapters.length === 0 || fullBookJobIsActive}
              onClick={() => {
                void queueFullBookGeneration();
              }}
            >
              {fullBookJob?.status === "running"
                ? "Generating full book…"
                : fullBookJob?.status === "queued"
                  ? "Full book queued…"
                  : "Queue full-book generation"}
            </button>
            {sampleIsCurrent ? (
              <Link
                className="rounded-full border border-white/20 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                href={`/player/${bookId}?narrator=${selectedNarrator}&mode=${selectedMode}&artifact=sample&renderState=current`}
              >
                Open generated sample
              </Link>
            ) : (
              <span className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium text-stone-300">
                Generate sample to unlock player
              </span>
            )}
            {sampleOutput?.assetPath && sampleIsCurrent ? (
              <Link
                className="rounded-full border border-white/20 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                href={`/api/audio/generated/${bookId}?kind=sample-generation`}
                target="_blank"
              >
                Download sample audio
              </Link>
            ) : null}
            {fullBookOutput?.assetPath ? (
              <Link
                className="rounded-full border border-white/20 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                href={`/player/${bookId}?artifact=full&renderState=current`}
              >
                Listen to full book
              </Link>
            ) : null}
            {fullBookOutput?.assetPath ? (
              <Link
                className="rounded-full border border-white/20 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                href={`/api/audio/generated/${bookId}?kind=full-book-generation`}
                target="_blank"
              >
                Download full-book audio
              </Link>
            ) : null}
            <Link
              className="rounded-full border border-white/20 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
              href="/import"
            >
              Back to import
            </Link>
            <Link
              className="rounded-full border border-white/20 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
              href="/#default-taste"
            >
              Review default taste
            </Link>
          </div>
          {generationJob?.status === "failed" ? (
            <div className="mt-6 rounded-[1.5rem] border border-rose-300 bg-rose-50 px-5 py-4 text-sm text-rose-950">
              <p className="font-medium">Sample generation failed</p>
              <p className="mt-2 text-rose-800">
                {generationJob.errorMessage ??
                  "The backend worker could not finish this sample job."}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <RetryJobButton jobId={generationJob.id} />
                <Link
                  className="rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-900"
                  href="/jobs"
                >
                  Open backend jobs
                </Link>
              </div>
            </div>
          ) : null}
          {fullBookJob?.status === "failed" ? (
            <div className="mt-6 rounded-[1.5rem] border border-rose-300 bg-rose-50 px-5 py-4 text-sm text-rose-950">
              <p className="font-medium">Full-book generation failed</p>
              <p className="mt-2 text-rose-800">
                {fullBookJob.errorMessage ??
                  "The backend worker could not finish the full-book job."}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <RetryJobButton jobId={fullBookJob.id} />
                <Link
                  className="rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-900"
                  href="/jobs"
                >
                  Open backend jobs
                </Link>
              </div>
            </div>
          ) : null}
          {sampleOutput?.assetPath && sampleIsCurrent ? (
            <div
              id="render-history"
              className="mt-6 rounded-[1.6rem] border border-white/15 bg-white/8 p-5 shadow-sm"
            >
              <p className="text-sm font-medium text-white">Generated sample audio</p>
              <p className="mt-2 text-sm text-stone-300">
                Provider: {sampleOutput.provider === "openai" ? "OpenAI TTS" : "Local mock TTS"}
              </p>
              <audio
                className="mt-4 w-full"
                controls
                preload="metadata"
                src={`/api/audio/generated/${bookId}?kind=sample-generation`}
              />
            </div>
          ) : null}
          {artifactHistory.length > 0 ? (
            <div className="mt-6 rounded-[1.6rem] border border-white/15 bg-white/8 p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">Render history</p>
                  <p className="mt-2 text-sm text-stone-300">
                    Current audio versions stay separate from older preserved renders, so
                    you can see what is active without losing the history.
                  </p>
                </div>
                <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-200">
                  {artifactHistory.length} artifact
                  {artifactHistory.length === 1 ? "" : "s"}
                </span>
              </div>
              {renderGroups.currentRenders.length > 0 && renderGroups.archivedRenders.length > 0 ? (
                <RenderHistorySummary
                  className="mt-5 rounded-[1.4rem] border border-sky-200/25 bg-[linear-gradient(135deg,rgba(125,211,252,0.14)_0%,rgba(255,255,255,0.05)_100%)] px-4 py-4"
                  cardClassName="rounded-[1.1rem] border border-white/10 bg-white/6 px-4 py-3"
                  detail="The current section shows the renders this book should use right now. The archived section keeps older versions available for playback and download, so you can compare how the taste changed over time without losing the earlier work."
                  detailClassName="mt-3 text-sm leading-6 text-stone-200"
                  eyebrow="Compare current vs archived"
                  eyebrowClassName="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-sky-100"
                  labelClassName="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-stone-300"
                  bodyClassName="mt-2 text-sm leading-6 text-white"
                  cards={[
                    {
                      id: "current",
                      label: "Current renders",
                      detail: String(renderGroups.currentRenders.length),
                    },
                    {
                      id: "archived",
                      label: "Archived renders",
                      detail: String(renderGroups.archivedRenders.length),
                    },
                    {
                      id: "best-use",
                      label: "Best use",
                      detail:
                        "Listen from current. Use archived renders only when you want to review or compare previous versions.",
                    },
                  ]}
                />
              ) : null}
              {renderGroups.currentRenders.length > 0 ? (
                <div className="mt-5">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="rounded-full bg-amber-300 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-950">
                      Current audio versions
                    </span>
                    <p className="text-sm text-stone-300">
                      These are the active sample and full-book renders for this title.
                    </p>
                  </div>
                  <div className="grid gap-3">
                    {renderGroups.currentRenders.map((artifact) => (
                      <article
                        key={artifact.id}
                        className="rounded-[1.35rem] border border-amber-300/30 bg-[linear-gradient(180deg,rgba(252,211,77,0.14)_0%,rgba(255,255,255,0.06)_100%)] px-4 py-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {artifact.kind === "full-book-generation"
                                ? "Current full-book render"
                                : "Current sample render"}
                            </p>
                            <p className="mt-2 text-sm text-stone-300">
                              {artifact.narratorId ? `Narrator ${artifact.narratorId} · ` : ""}
                              {artifact.mode ? `Mode ${artifact.mode} · ` : ""}
                              {artifact.provider === "openai" ? "OpenAI TTS" : "Local mock TTS"}
                            </p>
                          </div>
                          <span className="rounded-full border border-amber-300/40 bg-amber-300/15 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-amber-100">
                            {new Date(artifact.generatedAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <Link
                            className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                            href={`/player/${bookId}?artifactId=${artifact.id}&artifactKind=${artifact.kind}&renderState=current${
                              artifact.narratorId ? `&narrator=${artifact.narratorId}` : ""
                            }${artifact.mode ? `&mode=${artifact.mode}` : ""}`}
                          >
                            {artifact.kind === "full-book-generation"
                              ? "Listen current full book"
                              : "Open current sample"}
                          </Link>
                          {artifact.assetPath ? (
                            <Link
                              className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                              href={`/api/audio/generated/artifacts/${artifact.id}`}
                              target="_blank"
                            >
                              {artifact.kind === "full-book-generation"
                                ? "Download current full book"
                                : "Download current sample"}
                            </Link>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
              {renderGroups.archivedRenders.length > 0 ? (
                <div className="mt-5">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-200">
                      Archived renders
                    </span>
                    <p className="text-sm text-stone-300">
                      Older preserved versions you can still reopen or download.
                    </p>
                  </div>
                  <div className="grid gap-3">
                    {renderGroups.archivedRenders.map((artifact) => (
                      <article
                        key={artifact.id}
                        className="rounded-[1.35rem] border border-white/10 bg-black/10 px-4 py-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {artifact.kind === "full-book-generation"
                                ? "Archived full-book render"
                                : "Archived sample render"}
                            </p>
                            <p className="mt-2 text-sm text-stone-300">
                              {artifact.narratorId ? `Narrator ${artifact.narratorId} · ` : ""}
                              {artifact.mode ? `Mode ${artifact.mode} · ` : ""}
                              {artifact.provider === "openai" ? "OpenAI TTS" : "Local mock TTS"}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-200">
                              {new Date(artifact.generatedAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <Link
                            className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                            href={`/player/${bookId}?artifactId=${artifact.id}&artifactKind=${artifact.kind}&renderState=archived${
                              artifact.narratorId ? `&narrator=${artifact.narratorId}` : ""
                            }${artifact.mode ? `&mode=${artifact.mode}` : ""}`}
                          >
                            Open archived render
                          </Link>
                          {artifact.assetPath ? (
                            <Link
                              className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                              href={`/api/audio/generated/artifacts/${artifact.id}`}
                              target="_blank"
                            >
                              Download archived render
                            </Link>
                          ) : null}
                          <span className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-stone-300">
                            Job {artifact.jobId.slice(0, 12)}…
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </article>

        <article className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(180deg,#fffefb_0%,#ffffff_100%)] shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
          <div className="border-b border-stone-200/80 bg-[linear-gradient(135deg,#fffdf7_0%,#f7f3ea_52%,#eef4ff_100%)] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-xl">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
                  Source manuscript
                </p>
                <h2 className="mt-2 text-xl font-semibold text-stone-950">
                  Imported chapters
                </h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Review the parsed manuscript that is feeding this setup. The better
                  this source reads, the stronger the generated listening experience.
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-white/80 bg-white/80 px-4 py-3 text-sm font-medium text-stone-700 shadow-sm backdrop-blur">
                {chapters.length || 0} chapter{chapters.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <div className="p-6">
          <div className="mt-6 grid gap-4">
            {chapters.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-stone-300 bg-stone-50 p-5 text-sm text-stone-600">
                No imported draft found yet. Go back to import and continue from a parsed
                manuscript.
              </div>
            ) : (
              chapters.map((chapter) => (
                <article
                  key={chapter.id}
                  className="rounded-[1.6rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold text-stone-900">{chapter.title}</h3>
                    <span className="rounded-full bg-stone-100 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-600">
                      Ready for preview
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-stone-600">
                    {chapter.text.slice(0, 200) || "No chapter body found yet."}
                  </p>
                </article>
              ))
            )}
          </div>
          </div>
        </article>
      </section>
    </AppShell>
  );
}
