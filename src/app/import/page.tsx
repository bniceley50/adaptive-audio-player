"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/shared/app-shell";
import { JourneyHero } from "@/components/shared/journey-hero";
import { StudioDisclosure } from "@/components/shared/studio-disclosure";
import { featuredBookCircles } from "@/features/discovery/book-circles";
import {
  discoveryChangedEvent,
  readPinnedDiscoverySignal,
  togglePinnedDiscoverySignal,
} from "@/features/discovery/local-discovery";
import { getEditionDiscoveryReason } from "@/features/discovery/personalization";
import { featuredListeningEditions } from "@/features/discovery/listening-editions";
import { getAllPublicSocialMoments } from "@/features/social/public-moments";
import { useDiscoveryPreferences } from "@/features/discovery/use-discovery-preferences";
import { useSocialState } from "@/features/social/use-social-state";
import { extractImportText } from "@/lib/import/extract-text";
import {
  buildImportedAudioPlaceholderText,
  getImportedAudioSegmentCount,
} from "@/lib/import/imported-audio-chapters";
import { saveImportedAudioFile } from "@/lib/import/local-audio-assets";
import {
  createNextLocalLibraryBook,
  readRemovedLocalLibraryBooks,
  readDefaultListeningProfile,
  readLibraryTotals,
  upsertLocalLibraryBook,
  writeDefaultListeningProfile,
  writeLocalDraftText,
} from "@/lib/library/local-library";
import { parseChapters } from "@/lib/parser/parse-chapters";
import {
  getSupportedAudioImportExtension,
  isSupportedAudioImportExtension,
} from "@/lib/validation/import-validation";

const importJourney = [
  {
    id: "import",
    label: "01",
    title: "Import the source",
    detail: "Paste text, upload TXT, or bring in a private audiobook file.",
  },
  {
    id: "taste",
    label: "02",
    title: "Design the taste",
    detail: "Pick the narrator and listening mode that fit this title.",
  },
  {
    id: "sample",
    label: "03",
    title: "Generate the sample",
    detail: "Create the first preview before you commit to a full render.",
  },
  {
    id: "listen",
    label: "04",
    title: "Listen and promote",
    detail: "Open the player, then move into a full-book render when it feels right.",
  },
] as const;

function suggestTitleFromFilename(filename: string): string {
  const baseName = filename.replace(/\.[^.]+$/, "").trim();
  const collapsed = baseName.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

  if (!collapsed) {
    return "";
  }

  return collapsed.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function sortByRecent<
  T extends {
    savedAt?: string;
    joinedAt?: string;
    lastUsedAt?: string | null;
    lastOpenedAt?: string | null;
  },
>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(
      left.lastUsedAt ?? left.lastOpenedAt ?? left.savedAt ?? left.joinedAt ?? 0,
    ).getTime();
    const rightTime = new Date(
      right.lastUsedAt ?? right.lastOpenedAt ?? right.savedAt ?? right.joinedAt ?? 0,
    ).getTime();
    return rightTime - leftTime;
  });
}

export default function ImportPage() {
  const router = useRouter();
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);
  const audioPlanRef = useRef<HTMLElement | null>(null);
  const importRoadmapRef = useRef<HTMLElement | null>(null);
  const sourceTextRef = useRef<HTMLTextAreaElement | null>(null);
  const [title, setTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fileLabel, setFileLabel] = useState<string>("Paste text or upload a file");
  const [audioFileLabel, setAudioFileLabel] = useState<string>(
    "Import an MP3 or M4B audiobook file",
  );
  const [defaultListeningProfile, setDefaultListeningProfile] = useState(() =>
    typeof window !== "undefined" ? readDefaultListeningProfile() : null,
  );
  const [startingTasteSource, setStartingTasteSource] = useState<"default" | "recent" | "none">(
    () =>
      typeof window !== "undefined" && readDefaultListeningProfile()
        ? "default"
        : "none",
  );
  const [libraryTotals, setLibraryTotals] = useState(() =>
    typeof window !== "undefined"
      ? readLibraryTotals()
      : { totalBooks: 0, booksWithSavedTaste: 0, latestSampleBookId: null },
  );
  const [removedBooks, setRemovedBooks] = useState(() =>
    typeof window !== "undefined" ? readRemovedLocalLibraryBooks() : [],
  );
  const [selectedEditionFeedback, setSelectedEditionFeedback] = useState(false);
  const [pinnedDiscoverySignal, setPinnedDiscoverySignal] = useState(() =>
    typeof window !== "undefined" ? readPinnedDiscoverySignal() : null,
  );
  const { savedEditions, circleMemberships, promotedMoments } = useSocialState();
  const discoveryPreferences = useDiscoveryPreferences();
  const effectiveFollowedAuthors = useMemo(
    () =>
      discoveryPreferences.personalizationPaused ? [] : discoveryPreferences.followedAuthors,
    [discoveryPreferences.followedAuthors, discoveryPreferences.personalizationPaused],
  );
  const effectiveJoinedCircles = useMemo(
    () => (discoveryPreferences.personalizationPaused ? [] : discoveryPreferences.joinedCircles),
    [discoveryPreferences.joinedCircles, discoveryPreferences.personalizationPaused],
  );
  const effectiveTrackedFeatures = useMemo(
    () =>
      discoveryPreferences.personalizationPaused
        ? []
        : discoveryPreferences.trackedPlannedFeatures,
    [
      discoveryPreferences.personalizationPaused,
      discoveryPreferences.trackedPlannedFeatures,
    ],
  );
  const effectivePinnedSignal = useMemo(
    () => (discoveryPreferences.personalizationPaused ? null : pinnedDiscoverySignal),
    [discoveryPreferences.personalizationPaused, pinnedDiscoverySignal],
  );
  const [selectedEditionId] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return new URLSearchParams(window.location.search).get("edition");
  });
  const [selectedEditionEntry] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return new URLSearchParams(window.location.search).get("entry");
  });
  const [selectedSource] = useState<"paste" | "upload" | "audio" | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    const value = new URLSearchParams(window.location.search).get("source");
    if (value === "paste" || value === "upload" || value === "audio") {
      return value;
    }

    return null;
  });
  const [starterMomentId] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return new URLSearchParams(window.location.search).get("starterMoment");
  });

  const chapters = useMemo(() => parseChapters(sourceText), [sourceText]);
  const trimmedSourceText = sourceText.trim();
  const selectedEdition = useMemo(() => {
    return (
      featuredListeningEditions.find((edition) => edition.id === selectedEditionId) ?? null
    );
  }, [selectedEditionId]);
  const starterMoment = useMemo(() => {
    if (!starterMomentId) {
      return null;
    }

    return (
      getAllPublicSocialMoments(
        {
          savedEditions: [],
          circleMemberships: [],
          promotedMoments,
        },
        [],
      ).find((moment) => moment.id === starterMomentId) ?? null
    );
  }, [promotedMoments, starterMomentId]);
  const selectedEditionReason = useMemo(() => {
    if (!selectedEdition) {
      return null;
    }

    return getEditionDiscoveryReason(selectedEdition.id, {
      followedAuthors: effectiveFollowedAuthors,
      joinedCircles: effectiveJoinedCircles,
      trackedPlannedFeatures: effectiveTrackedFeatures,
    });
  }, [
    effectiveFollowedAuthors,
    effectiveJoinedCircles,
    effectiveTrackedFeatures,
    selectedEdition,
  ]);
  const socialSeedEdition = useMemo(() => {
    const latestSavedEdition = sortByRecent(savedEditions)[0] ?? null;
    if (!latestSavedEdition) {
      return null;
    }

    return (
      featuredListeningEditions.find((edition) => edition.id === latestSavedEdition.editionId) ??
      null
    );
  }, [savedEditions]);
  const socialSeedCircle = useMemo(() => {
    const latestCircleMembership = sortByRecent(circleMemberships)[0] ?? null;
    if (!latestCircleMembership) {
      return null;
    }

    return (
      featuredBookCircles.find((circle) => circle.id === latestCircleMembership.circleId) ?? null
    );
  }, [circleMemberships]);
  const highlightedFuturePath = useMemo(() => {
    if (
      selectedSource === "audio" ||
      (effectivePinnedSignal?.kind === "feature" &&
        effectivePinnedSignal.id === "private-audio-files") ||
      effectiveTrackedFeatures.includes("private-audio-files")
    ) {
      return {
        eyebrow:
          effectivePinnedSignal?.kind === "feature" &&
          effectivePinnedSignal.id === "private-audio-files"
            ? "Pinned future path"
            : discoveryPreferences.personalizationPaused
              ? "Neutral import mode"
            : "Saved future path",
        title: "Private audiobook files",
        detail:
          effectivePinnedSignal?.kind === "feature" &&
          effectivePinnedSignal.id === "private-audio-files"
            ? "You pinned private audiobook imports, so this roadmap stays ahead of the normal import guidance while the simple text flow remains the fastest path today."
            : discoveryPreferences.personalizationPaused
              ? "Personalization is paused, so this roadmap is only showing because you opened the audio path directly."
            : "You already showed interest in private audiobook imports, so this roadmap stays visible while the simple text flow remains the fastest path today.",
        actionLabel: "Review audio import plans",
        target: "audio-plan" as const,
      };
    }

    if (
      effectivePinnedSignal?.kind === "feature" &&
      effectivePinnedSignal.id === "richer-document-imports"
    ) {
      return {
        eyebrow: "Pinned future path",
        title: "Richer document imports",
        detail:
          "You pinned richer document imports, so the roadmap stays in front while the live text flow remains simple and ready now.",
        actionLabel: "Review the import roadmap",
        target: "import-roadmap" as const,
      };
    }

    if (effectiveTrackedFeatures.includes("richer-document-imports")) {
      return {
        eyebrow: "Saved future path",
        title: "Richer document imports",
        detail:
          "You saved richer document imports for later, so the intake roadmap keeps EPUB, PDF, and DOCX plans visible without getting in the way of the live text flow.",
        actionLabel: "Review the import roadmap",
        target: "import-roadmap" as const,
      };
    }

    return null;
  }, [
    discoveryPreferences.personalizationPaused,
    effectivePinnedSignal,
    effectiveTrackedFeatures,
    selectedSource,
  ]);
  const importState = error
    ? {
        label: "Import needs attention",
        detail: error,
        action: "Fix the source or switch to pasted text.",
        accent:
          "border-rose-200 bg-[linear-gradient(135deg,#fff1f2_0%,#fffaf9_100%)] text-rose-950",
        badge: "border-rose-200 bg-white/80 text-rose-700",
      }
    : chapters.length > 0
      ? {
          label: "Ready for setup",
          detail:
            "The parser found a stable chapter structure. You can move straight into taste design.",
          action: "Continue to voice setup and generate a sample.",
          accent:
            "border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#f8fffc_100%)] text-emerald-950",
          badge: "border-emerald-200 bg-white/80 text-emerald-700",
        }
      : trimmedSourceText
        ? {
            label: "Text is loaded",
            detail:
              "Your draft is in the intake flow. Preview the parsed chapters before you continue.",
            action: "Preview chapters to confirm the structure.",
            accent:
              "border-amber-200 bg-[linear-gradient(135deg,#fff7d8_0%,#fffdf7_100%)] text-amber-950",
            badge: "border-amber-200 bg-white/80 text-amber-700",
          }
        : {
            label: "Ready to import",
            detail:
              "Start by uploading a file or pasting text. The app will parse chapters before narrator setup.",
            action: "Add source text to begin the intake flow.",
            accent:
              "border-stone-200 bg-[linear-gradient(135deg,#faf7ef_0%,#ffffff_100%)] text-stone-950",
            badge: "border-stone-200 bg-white/80 text-stone-600",
        };
  const nextStepCard = chapters.length > 0
    ? {
        label: "Open voice setup",
        detail:
          "The chapter map is stable. Move into narrator setup and generate the first sample.",
        hint: "This is the fastest path once the import is parsed.",
        actionLabel: "Open voice setup",
        action: () => continueToSetup(),
      }
    : trimmedSourceText
      ? {
          label: "Review parsed chapters",
          detail:
            "Your source is loaded. Confirm the chapter structure before you pick the sound.",
          hint: "Previewing now keeps the next screen cleaner.",
          actionLabel: "Review parsed chapters",
          action: () => previewPastedText(),
        }
      : {
          label: "Paste text or upload a file",
          detail:
            "Bring in the book first. The app will handle chapter parsing before voice setup.",
          hint: "Start with pasted text for the quickest first run.",
          actionLabel: "Focus text editor",
          action: () => sourceTextRef.current?.focus(),
        };

  useEffect(() => {
    let cancelled = false;

    async function hydrateStartingTaste() {
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

      const syncedDefault = payload.snapshot.defaultListeningProfile ?? null;
      const syncedRecent = payload.snapshot.listeningProfiles[0] ?? null;

      if (!defaultListeningProfile && syncedDefault) {
        setDefaultListeningProfile(syncedDefault);
        setStartingTasteSource("default");
      } else if (!defaultListeningProfile && syncedRecent) {
        setDefaultListeningProfile(syncedRecent);
        setStartingTasteSource("recent");
      }

      setLibraryTotals((currentTotals) => ({
        totalBooks: Math.max(
          currentTotals.totalBooks,
          payload.snapshot?.libraryBooks.length ?? 0,
        ),
        booksWithSavedTaste: Math.max(
          currentTotals.booksWithSavedTaste,
          payload.snapshot?.listeningProfiles.length ?? 0,
        ),
        latestSampleBookId:
          currentTotals.latestSampleBookId ??
          payload.snapshot?.generationOutputs?.find(
            (output) => output.kind === "sample-generation",
          )?.bookId ??
          null,
      }));

      setRemovedBooks((currentRemovedBooks) =>
        currentRemovedBooks.length > 0
          ? currentRemovedBooks
          : payload.snapshot?.removedBooks ?? [],
      );
    }

    void hydrateStartingTaste();

    return () => {
      cancelled = true;
    };
  }, [defaultListeningProfile]);

  useEffect(() => {
    function refreshPinnedSignal() {
      setPinnedDiscoverySignal(readPinnedDiscoverySignal());
    }

    refreshPinnedSignal();
    window.addEventListener(discoveryChangedEvent, refreshPinnedSignal);

    return () => {
      window.removeEventListener(discoveryChangedEvent, refreshPinnedSignal);
    };
  }, []);

  useEffect(() => {
    if (selectedSource === "paste") {
      sourceTextRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      sourceTextRef.current?.focus();
      return;
    }

    if (selectedSource === "upload") {
      fileInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      fileInputRef.current?.focus();
      return;
    }

    if (selectedSource === "audio") {
      audioFileInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      audioFileInputRef.current?.focus();
    }
  }, [selectedSource]);

  async function handleTextFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setFileLabel(file.name);
    setTitle((currentTitle) =>
      currentTitle.trim() ? currentTitle : suggestTitleFromFilename(file.name),
    );

    try {
      const text = await extractImportText(file);
      setSourceText(text);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to read import.");
    }
  }

  async function handleAudioFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!isSupportedAudioImportExtension(file.name)) {
      setError("Private audiobook imports currently support MP3 and M4B files.");
      return;
    }

    const nextTitle = title.trim() || suggestTitleFromFilename(file.name);
    const format = getSupportedAudioImportExtension(file.name);
    if (!format) {
      setError("Private audiobook imports currently support MP3 and M4B files.");
      return;
    }

    setAudioFileLabel(file.name);
    setTitle(nextTitle);
    setError(null);

    try {
      const bookId = crypto.randomUUID();
      const metadata = await saveImportedAudioFile(bookId, file);
      const chapterCount = getImportedAudioSegmentCount(metadata.durationSeconds);
      const nextBook = createNextLocalLibraryBook(nextTitle, chapterCount, {
        bookId,
        sourceType: "audio",
        importedAudioFormat: format,
        importedAudioFileName: file.name,
        genreLabel: "Imported audio",
        coverLabel: "Private audio",
        coverGlyph: "AU",
      });
      const nextBookWithAudio = {
        ...nextBook,
        importedAudioDurationSeconds: metadata.durationSeconds,
      };

      writeLocalDraftText(
        nextBookWithAudio.bookId,
        buildImportedAudioPlaceholderText({
          title: nextBookWithAudio.title,
          fileName: metadata.fileName,
          format: metadata.format,
          durationSeconds: metadata.durationSeconds,
        }),
      );
      upsertLocalLibraryBook(nextBookWithAudio);
      router.push(`/player/${nextBookWithAudio.bookId}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to import the audiobook file.",
      );
    }
  }

  function previewPastedText() {
    const trimmed = sourceText.trim();
    if (!trimmed) {
      setError("Paste some text before previewing chapters.");
      return;
    }

    setSourceText(trimmed);
    setError(null);
  }

  function continueToSetup() {
    const trimmed = sourceText.trim();
    if (!trimmed) {
      setError("Preview chapters before moving to voice setup.");
      return;
    }

    const nextBook = createNextLocalLibraryBook(title.trim(), chapters.length);
    writeLocalDraftText(nextBook.bookId, trimmed);
    upsertLocalLibraryBook(nextBook);
    router.push(`/books/${nextBook.bookId}`);
  }

  function openHighlightedFuturePath(target: "audio-plan" | "import-roadmap") {
    const ref = target === "audio-plan" ? audioPlanRef : importRoadmapRef;
    ref.current?.scrollIntoView({
      behavior: "smooth",
      block: target === "audio-plan" ? "center" : "start",
    });
  }

  return (
    <AppShell eyebrow="Step 1" title="Import a book">
      <section className="overflow-hidden rounded-[1.75rem] border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 bg-[linear-gradient(135deg,#f7f0df_0%,#fffdf7_45%,#edf4ff_100%)] p-8">
          <JourneyHero
            eyebrow="Import flow"
            title="Import your manuscript"
            detail="Start with pasted text, a plain text file, or a private DRM-free audiobook file. Richer document connectors can layer onto this same flow later."
            currentIndex={0}
            steps={importJourney}
            sectionClassName="border-0 bg-transparent p-0 shadow-none"
            aside={
              <div className="flex flex-wrap gap-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                <span className="rounded-full border border-white/80 bg-white/80 px-3 py-2 backdrop-blur">
                  Guided intake
                </span>
                <span className="rounded-full border border-white/80 bg-white/80 px-3 py-2 backdrop-blur">
                  Private import
                </span>
              </div>
            }
          />
        </div>

        <div className="p-8">
          {!selectedEdition && (socialSeedEdition || socialSeedCircle) ? (
            <div className="mb-5 rounded-[1.6rem] border border-amber-200 bg-[linear-gradient(135deg,#fff8e8_0%,#ffffff_100%)] px-5 py-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Synced social memory
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-stone-950">
                    Pick up from a saved edition or joined circle
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    Your social shelf now syncs with the workspace. Start this import from
                    something you already saved instead of beginning from a blank state.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {socialSeedEdition ? (
                      <Link
                        className="rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
                        href={`/import?edition=${socialSeedEdition.id}`}
                      >
                        Use saved edition
                      </Link>
                    ) : null}
                    {socialSeedCircle ? (
                      <Link
                        className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                        href={`/import?edition=${socialSeedCircle.editionId}`}
                      >
                        Start with joined circle
                      </Link>
                    ) : null}
                  </div>
                </div>
                <div className="grid min-w-[250px] gap-3">
                  {socialSeedEdition ? (
                    <div className="rounded-[1.2rem] border border-white/70 bg-white/90 px-4 py-4 shadow-sm">
                      <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-stone-500">
                        Latest saved edition
                      </p>
                      <p className="mt-2 text-sm font-semibold text-stone-950">
                        {socialSeedEdition.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-stone-600">
                        {socialSeedEdition.narratorName} in{" "}
                        <span className="capitalize">{socialSeedEdition.mode}</span>
                      </p>
                    </div>
                  ) : null}
                  {socialSeedCircle ? (
                    <div className="rounded-[1.2rem] border border-white/70 bg-white/90 px-4 py-4 shadow-sm">
                      <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-stone-500">
                        Latest joined circle
                      </p>
                      <p className="mt-2 text-sm font-semibold text-stone-950">
                        {socialSeedCircle.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-stone-600">
                        {socialSeedCircle.checkpoint}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {highlightedFuturePath ? (
            <div className="mb-5 rounded-[1.5rem] border border-sky-200 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_100%)] px-5 py-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sky-700">
                    {highlightedFuturePath.eyebrow}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-stone-950">
                    {highlightedFuturePath.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    {highlightedFuturePath.detail}
                  </p>
                </div>
                <button
                  className="rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-sky-900 transition hover:bg-sky-50"
                  type="button"
                  onClick={() => openHighlightedFuturePath(highlightedFuturePath.target)}
                >
                  {highlightedFuturePath.actionLabel}
                </button>
                <button
                  className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                  type="button"
                  onClick={() => {
                    const id =
                      highlightedFuturePath.target === "audio-plan"
                        ? "private-audio-files"
                        : "richer-document-imports";
                    togglePinnedDiscoverySignal({
                      kind: "feature",
                      id,
                    });
                  }}
                >
                  {pinnedDiscoverySignal?.kind === "feature" &&
                  ((highlightedFuturePath.target === "audio-plan" &&
                    pinnedDiscoverySignal.id === "private-audio-files") ||
                    (highlightedFuturePath.target === "import-roadmap" &&
                      pinnedDiscoverySignal.id === "richer-document-imports"))
                    ? "Unpin path"
                    : "Pin path"}
                </button>
              </div>
            </div>
          ) : null}

          <div
            className={`rounded-[1.6rem] border p-5 shadow-sm ${importState.accent}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] ${importState.badge}`}
                  >
                    Current state
                  </span>
                  <span
                    className={`rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] ${importState.badge}`}
                  >
                    {importState.label}
                  </span>
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-6">
                  {importState.detail}
                </p>
                <p className="mt-3 text-sm font-medium">
                  Next move: {importState.action}
                </p>
              </div>
              <div className="grid min-w-[240px] gap-3 sm:grid-cols-3 sm:gap-2">
                <div className="rounded-[1.2rem] border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-current/60">
                    Source
                  </p>
                  <p className="mt-2 text-sm font-semibold text-current">
                    {fileLabel !== "Paste text or upload a file"
                      ? fileLabel
                      : trimmedSourceText
                        ? "Pasted text"
                        : "Waiting for source"}
                  </p>
                </div>
                <div className="rounded-[1.2rem] border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-current/60">
                    Shelf size
                  </p>
                  <p className="mt-2 text-sm font-semibold text-current">
                    {libraryTotals.totalBooks} imported title
                    {libraryTotals.totalBooks === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="rounded-[1.2rem] border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-current/60">
                    Starting taste
                  </p>
                  <p className="mt-2 text-sm font-semibold text-current">
                    {defaultListeningProfile
                      ? `${defaultListeningProfile.narratorName} · ${defaultListeningProfile.mode}`
                      : "Latest taste fallback"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {defaultListeningProfile && startingTasteSource === "default" ? (
            <div className="mt-5 rounded-2xl border border-violet-200 bg-[linear-gradient(135deg,#f6f0ff_0%,#fbf8ff_100%)] px-4 py-4 text-sm text-violet-900 shadow-sm">
              New books will start from your default taste:{" "}
              {defaultListeningProfile.narratorName} in{" "}
              <span className="capitalize">{defaultListeningProfile.mode}</span>. Existing
              books keep their own saved taste.
            </div>
          ) : defaultListeningProfile && startingTasteSource === "recent" ? (
            <div className="mt-5 rounded-2xl border border-sky-200 bg-[linear-gradient(135deg,#eff6ff_0%,#f8fbff_100%)] px-4 py-4 text-sm text-sky-900 shadow-sm">
              No default taste is saved yet, so new books will start from your latest
              synced taste: {defaultListeningProfile.narratorName} in{" "}
              <span className="capitalize">{defaultListeningProfile.mode}</span>.
            </div>
          ) : null}

          {selectedEdition ? (
            <div className="mt-5 rounded-[1.6rem] border border-stone-200 bg-[linear-gradient(135deg,#fffdf7_0%,#ffffff_52%,#eef4ff_100%)] px-5 py-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                    <span className="rounded-full bg-stone-100 px-2.5 py-1">
                      Selected edition
                    </span>
                    <span className="rounded-full bg-stone-100 px-2.5 py-1 capitalize">
                      {selectedEdition.mode}
                    </span>
                    <span className="rounded-full bg-stone-100 px-2.5 py-1">
                      {selectedEdition.genreLabel}
                    </span>
                    {selectedEditionEntry === "trending-edition" ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                        Trending now
                      </span>
                    ) : null}
                    {selectedEditionEntry === "moment-circle-starter" ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                        Fresh circle starter
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-stone-950">
                    Start this import with {selectedEdition.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    {selectedEdition.creator} recommends {selectedEdition.narratorName} for{" "}
                    {selectedEdition.bookTitle}. It is best for {selectedEdition.bestFor}.
                  </p>
                  {selectedEditionEntry === "trending-edition" ? (
                    <div className="mt-4 rounded-[1.1rem] border border-amber-200 bg-amber-50/80 px-4 py-3 text-left">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-amber-700">
                        Focused from trending now
                      </p>
                      <p className="mt-2 text-sm leading-6 text-amber-900">
                        This edition was chosen from the live home trend strip, so import is
                        keeping the most active listening style front and center while you
                        bring in the book.
                      </p>
                    </div>
                  ) : null}
                  {selectedEditionEntry === "moment-circle-starter" && starterMoment ? (
                    <div className="mt-4 rounded-[1.1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-left">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        Focused from a public moment
                      </p>
                      <p className="mt-2 text-sm italic leading-6 text-emerald-950">
                        “{starterMoment.quote}”
                      </p>
                      <p className="mt-2 text-sm leading-6 text-emerald-900">
                        This import is being framed as a fresh circle starter, so the selected edition stays in front as the quickest way to turn that moment into a new shared listening thread.
                      </p>
                    </div>
                  ) : null}
                  {selectedEditionReason ? (
                    <div className="mt-4 rounded-[1.1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-left">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        {selectedEditionReason.label}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-emerald-900">
                        {selectedEditionReason.detail}
                      </p>
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      className="rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
                      type="button"
                      onClick={() => {
                        writeDefaultListeningProfile({
                          bookId: `featured-${selectedEdition.id}`,
                          narratorId: selectedEdition.narratorName
                            .toLowerCase()
                            .replace(/\s+/g, "-"),
                          narratorName: selectedEdition.narratorName,
                          mode: selectedEdition.mode,
                        });
                        setDefaultListeningProfile({
                          bookId: `featured-${selectedEdition.id}`,
                          narratorId: selectedEdition.narratorName
                            .toLowerCase()
                            .replace(/\s+/g, "-"),
                          narratorName: selectedEdition.narratorName,
                          mode: selectedEdition.mode,
                        });
                        setStartingTasteSource("default");
                        setSelectedEditionFeedback(true);
                        window.setTimeout(() => setSelectedEditionFeedback(false), 1800);
                      }}
                    >
                      Use this edition as my starting taste
                    </button>
                    <button
                      className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                      type="button"
                      onClick={() => sourceTextRef.current?.focus()}
                    >
                      Paste text now
                    </button>
                  </div>
                  {selectedEditionFeedback ? (
                    <p className="mt-3 text-sm text-emerald-700">
                      This edition is now the default starting taste for new imports.
                    </p>
                  ) : null}
                </div>
                <div className="rounded-[1.2rem] border border-stone-200 bg-white px-4 py-4 text-right shadow-sm">
                  <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-stone-500">
                    Best next move
                  </p>
                  <p className="mt-2 text-sm font-semibold text-stone-950">
                    Paste the text and keep this edition in mind during setup
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <article className="rounded-[1.4rem] border border-emerald-200 bg-[linear-gradient(180deg,#f0fdf4_0%,#ffffff_100%)] p-5 shadow-sm">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Best today
              </p>
              <h3 className="mt-3 text-lg font-semibold text-stone-950">Paste the book text</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Fastest first run. Paste chapters directly and move into voice setup right away.
              </p>
              <button
                className="mt-4 rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
                type="button"
                onClick={() => sourceTextRef.current?.focus()}
              >
                Paste text now
              </button>
            </article>
            <article className="rounded-[1.4rem] border border-sky-200 bg-[linear-gradient(180deg,#eff6ff_0%,#ffffff_100%)] p-5 shadow-sm">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sky-700">
                Supported upload
              </p>
              <h3 className="mt-3 text-lg font-semibold text-stone-950">Upload a `.txt` file</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Plain text uploads work today. The rest of the flow stays the same after upload.
              </p>
              <button
                className="mt-4 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose a `.txt` file
              </button>
            </article>
            <article className="rounded-[1.4rem] border border-cyan-200 bg-[linear-gradient(180deg,#ecfeff_0%,#ffffff_100%)] p-5 shadow-sm">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-cyan-700">
                Private audio
              </p>
              <h3 className="mt-3 text-lg font-semibold text-stone-950">Import MP3 or M4B</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Bring in a DRM-free or already-converted personal audiobook file and open it directly in the player.
              </p>
              <button
                className="mt-4 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                type="button"
                onClick={() => audioFileInputRef.current?.click()}
              >
                Choose MP3 or M4B
              </button>
            </article>
            <article className="rounded-[1.4rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-5 shadow-sm">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Planned next
              </p>
              <h3 className="mt-3 text-lg font-semibold text-stone-950">
                EPUB, PDF, DOCX, and richer library connectors
              </h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Richer document imports and cloud-style connectors can layer on without changing the simple intake path that already works today.
              </p>
              <button
                className="mt-4 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                type="button"
                onClick={() =>
                  audioPlanRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  })
                }
              >
                See audiobook file plans
              </button>
            </article>
          </div>

          <section
            ref={importRoadmapRef}
            className="mt-4 overflow-hidden rounded-[1.5rem] border border-stone-200 bg-[linear-gradient(135deg,#fffefb_0%,#ffffff_100%)] shadow-sm"
          >
            <div className="border-b border-stone-200 bg-white/80 px-5 py-4">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                    Import roadmap
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-stone-950">
                    What works today, what comes next, and what comes later
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
                    The app is being shaped around private-use imports. It starts with the
                    simplest reliable path first, then adds richer formats without turning
                    import into a confusing setup wall.
                  </p>
                </div>
                <div className="rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-sm text-stone-600">
                  Private library first
                </div>
              </div>
            </div>
            <div className="grid gap-4 px-5 py-5 md:grid-cols-3">
              <article className="rounded-[1.4rem] border border-emerald-200 bg-[linear-gradient(180deg,#f0fdf4_0%,#ffffff_100%)] p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    Today
                  </span>
                  <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    Live now
                  </span>
                </div>
                <h4 className="mt-3 text-lg font-semibold text-stone-950">
                  Paste text or upload `.txt`
                </h4>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  This is the fastest path into chapter parsing, narrator setup, and the
                  first listening sample.
                </p>
              </article>
              <article className="rounded-[1.4rem] border border-sky-200 bg-[linear-gradient(180deg,#eff6ff_0%,#ffffff_100%)] p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-sky-200 bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sky-700">
                    Today
                  </span>
                  <span className="rounded-full border border-sky-200 bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sky-700">
                    Private audio
                  </span>
                </div>
                <h4 className="mt-3 text-lg font-semibold text-stone-950">
                  MP3 and M4B audiobook files
                </h4>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Bring in DRM-free or already-converted personal audiobook files and open them directly in the player.
                </p>
              </article>
              <article className="rounded-[1.4rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                    Later
                  </span>
                  <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                    Richer connectors
                  </span>
                </div>
                <h4 className="mt-3 text-lg font-semibold text-stone-950">
                  Document imports and library connectors
                </h4>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  EPUB, PDF, DOCX, and cloud-style library connections can layer onto this
                  same intake flow later without changing the core product shape.
                </p>
              </article>
            </div>
          </section>

          <section
            ref={audioPlanRef}
            className="mt-4 rounded-[1.5rem] border border-sky-200 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_100%)] p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Private audiobook files
                </p>
                <h3 className="mt-2 text-lg font-semibold text-stone-950">
                  Private audiobook import works locally in this browser
                </h3>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  This intake is for private-use audiobook files you already control, such
                  as DRM-free purchases or already-converted personal files. The app treats
                  them like a clean listening intake, not a DRM-removal tool.
                </p>
              </div>
              <div className="rounded-[1.2rem] border border-sky-200 bg-white px-4 py-4 text-right shadow-sm">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Planned support
                </p>
                <p className="mt-2 text-sm font-semibold text-stone-950">
                  M4B and MP3 first
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <article className="rounded-2xl border border-sky-200 bg-white/85 px-4 py-3 shadow-sm">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Step 1
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Bring in a personal audiobook file you already control.
                </p>
              </article>
              <article className="rounded-2xl border border-sky-200 bg-white/85 px-4 py-3 shadow-sm">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Step 2
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Keep the source file local to this browser and open it in the player immediately.
                </p>
              </article>
              <article className="rounded-2xl border border-sky-200 bg-white/85 px-4 py-3 shadow-sm">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Step 3
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Layer circles, discovery, and shelf memory onto that imported audiobook next.
                </p>
              </article>
            </div>
          </section>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              <div className="rounded-[1.5rem] border border-stone-200 bg-[linear-gradient(180deg,#ffffff_0%,#faf8f4_100%)] p-6 shadow-sm">
                <label className="block text-sm font-medium text-stone-900" htmlFor="book-title">
                  Book title
                </label>
                <input
                  id="book-title"
                  className="mt-3 w-full rounded-[1.5rem] border border-stone-200 bg-white px-5 py-4 text-sm text-stone-800 outline-none transition focus:border-stone-400"
                  name="book-title"
                  placeholder="Name your import"
                  ref={titleInputRef}
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
                <p className="mt-3 text-sm text-stone-500">
                  Give this import a shelf-worthy title before you move into setup.
                </p>
              </div>

              <label className="block rounded-[1.5rem] border border-stone-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 text-sm text-stone-700 shadow-sm">
                <span className="block text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                  Upload
                </span>
                <span className="mt-2 block text-lg font-semibold text-stone-900">
                  Upload a file
                </span>
                <span className="mt-2 block text-stone-600">{fileLabel}</span>
                <input
                  className="mt-5 block w-full text-sm text-stone-700 file:mr-4 file:rounded-full file:border-0 file:bg-stone-950 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
                  type="file"
                  accept=".txt,text/plain"
                  ref={fileInputRef}
                  onChange={handleTextFileChange}
                />
                <p className="mt-3 text-sm text-stone-500">
                  Uploads currently support plain text files only.
                </p>
              </label>

              <label className="block rounded-[1.5rem] border border-cyan-200 bg-[linear-gradient(180deg,#ecfeff_0%,#ffffff_100%)] p-6 text-sm text-stone-700 shadow-sm">
                <span className="block text-xs font-medium uppercase tracking-[0.18em] text-cyan-700">
                  Private audiobook
                </span>
                <span className="mt-2 block text-lg font-semibold text-stone-900">
                  Import an MP3 or M4B file
                </span>
                <span className="mt-2 block text-stone-600">{audioFileLabel}</span>
                <input
                  className="mt-5 block w-full text-sm text-stone-700 file:mr-4 file:rounded-full file:border-0 file:bg-stone-950 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
                  type="file"
                  accept=".mp3,.m4b,audio/mpeg,audio/mp4"
                  ref={audioFileInputRef}
                  onChange={handleAudioFileChange}
                />
                <p className="mt-3 text-sm text-stone-500">
                  The file stays local to this browser and opens directly in the player.
                </p>
              </label>

              <div className="rounded-[1.5rem] border border-stone-200 bg-[linear-gradient(180deg,#ffffff_0%,#faf8f4_100%)] p-6 shadow-sm">
                <label className="block text-sm font-medium text-stone-900" htmlFor="source-text">
                  Or paste text
                </label>
                <textarea
                  id="source-text"
                  className="mt-3 min-h-64 w-full rounded-[1.5rem] border border-stone-200 bg-white p-5 text-sm leading-6 text-stone-800 outline-none transition focus:border-stone-400"
                  name="source-text"
                  placeholder={"Chapter 1\nIt was a wet night...\n\nChapter 2\nThe city woke late."}
                  ref={sourceTextRef}
                  value={sourceText}
                  onChange={(event) => setSourceText(event.target.value)}
                />
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    className="rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-stone-800"
                    type="button"
                    onClick={previewPastedText}
                  >
                    Preview chapters
                  </button>
                  <p className="text-sm text-stone-500">
                    Clean chapter headings here before moving to voice setup.
                  </p>
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-[1.5rem] border border-stone-950 bg-[linear-gradient(135deg,#111827_0%,#1f2937_45%,#312e81_100%)] p-5 text-white shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">
                      Fastest path
                    </p>
                    <h3 className="mt-3 text-lg font-semibold text-white">
                      {nextStepCard.label}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-white/80">
                      {nextStepCard.detail}
                    </p>
                    <p className="mt-3 text-sm text-white/65">
                      {nextStepCard.hint}
                    </p>
                  </div>
                  <div className="rounded-[1.2rem] border border-white/15 bg-white/10 px-4 py-4 text-right backdrop-blur">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/60">
                      Best next move
                    </p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      {nextStepCard.actionLabel}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    className="rounded-full bg-white px-5 py-3 text-sm font-medium text-stone-950 shadow-sm transition hover:bg-stone-100"
                    type="button"
                    onClick={nextStepCard.action}
                  >
                    {nextStepCard.actionLabel}
                  </button>
                  <button
                    className="rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/15"
                    type="button"
                    onClick={() => titleInputRef.current?.focus()}
                  >
                    Name the book first
                  </button>
                </div>
                <div className="mt-4 grid gap-3">
                  <article className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/60">
                      1. Bring in the text
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/80">
                      Paste text or upload a file to seed the book quickly.
                    </p>
                  </article>
                  <article className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/60">
                      2. Confirm the structure
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/80">
                      Preview the parser output so setup starts from a clean chapter map.
                    </p>
                  </article>
                  <article className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/60">
                      3. Hear the sample
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/80">
                      Move into setup, keep the sound simple, and generate the first preview.
                    </p>
                  </article>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-stone-200 bg-[linear-gradient(180deg,#f9f6ef_0%,#ffffff_100%)] p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                  What happens next
                </p>
                <ol className="mt-4 space-y-3 text-sm text-stone-700">
                  <li className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <span className="font-medium text-stone-950">1. Import</span>
                    <span className="mt-1 block text-stone-600">
                      Upload a file or paste text into the editor.
                    </span>
                  </li>
                  <li className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <span className="font-medium text-stone-950">2. Review chapters</span>
                    <span className="mt-1 block text-stone-600">
                      Check the parse and confirm the book structure feels right.
                    </span>
                  </li>
                  <li className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <span className="font-medium text-stone-950">3. Choose the sound</span>
                    <span className="mt-1 block text-stone-600">
                      Move into narrator and listening-mode setup for the sample.
                    </span>
                  </li>
                </ol>
              </div>

              {error ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </p>
              ) : null}

              {chapters.length > 0 ? (
                <div className="rounded-[1.5rem] border border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#f8fffc_100%)] p-5 text-sm text-emerald-950 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-emerald-700">
                          Ready for setup
                        </span>
                        <span className="rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                          {chapters.length} parsed chapter{chapters.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-emerald-950">
                        {title.trim() || "Untitled import"} is ready for narrator setup
                      </h3>
                      <p className="mt-2 max-w-xl leading-6 text-emerald-900">
                        The import looks valid. The next screen will use this parsed structure,
                        carry over your title, and start from the best available taste profile
                        before you generate the first sample.
                      </p>
                    </div>
                    <div className="rounded-[1.2rem] border border-emerald-200 bg-white/85 px-4 py-4 text-right shadow-sm">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        Starting taste
                      </p>
                      <p className="mt-2 font-semibold text-emerald-950">
                        {defaultListeningProfile
                          ? `${defaultListeningProfile.narratorName} · ${defaultListeningProfile.mode}`
                          : "Latest taste fallback"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-emerald-900">
                        {startingTasteSource === "default"
                          ? "Book-specific saved taste will override this after the first setup pass."
                          : "This comes from your latest synced listening taste until you save a default or a book-specific profile."}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <article className="rounded-2xl border border-emerald-200 bg-white/80 px-4 py-3">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        1. Review the taste
                      </p>
                      <p className="mt-2 leading-6 text-emerald-900">
                        Confirm narrator and listening mode on the setup screen.
                      </p>
                    </article>
                    <article className="rounded-2xl border border-emerald-200 bg-white/80 px-4 py-3">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        2. Generate a sample
                      </p>
                      <p className="mt-2 leading-6 text-emerald-900">
                        Render one sample first before committing to a full-book pass.
                      </p>
                    </article>
                    <article className="rounded-2xl border border-emerald-200 bg-white/80 px-4 py-3">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        3. Start listening
                      </p>
                      <p className="mt-2 leading-6 text-emerald-900">
                        Move into playback once the sample sounds right.
                      </p>
                    </article>
                  </div>
                </div>
              ) : null}

              <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50/80 p-5 shadow-sm">
                <div className="flex flex-wrap gap-3">
                  <button
                    className="rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-stone-800 disabled:bg-stone-300 disabled:text-stone-500"
                    type="button"
                    disabled={chapters.length === 0}
                    onClick={continueToSetup}
                  >
                    Continue to voice setup
                  </button>
                  <Link
                    className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:text-stone-950"
                    href="/"
                  >
                    Back to library
                  </Link>
                </div>
              </div>
            </aside>
          </div>

          <div className="mt-6">
            <StudioDisclosure
              detail="Open this when you want deeper library context before importing, including synced shelf totals, saved taste counts, and removed-book recovery state."
              title="Library context and recovery tools"
            >
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <article className="rounded-2xl border border-stone-200 bg-[linear-gradient(180deg,#faf7f0_0%,#ffffff_100%)] p-4 shadow-sm">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                      Library books
                    </p>
                    <p className="mt-3 text-2xl font-semibold text-stone-900">
                      {libraryTotals.totalBooks}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-stone-500">
                      Imports already living in your private shelf.
                    </p>
                  </article>
                  <article className="rounded-2xl border border-stone-200 bg-[linear-gradient(180deg,#f4f8ff_0%,#ffffff_100%)] p-4 shadow-sm">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                      Saved tastes
                    </p>
                    <p className="mt-3 text-2xl font-semibold text-stone-900">
                      {libraryTotals.booksWithSavedTaste}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-stone-500">
                      Books already carrying narrator and mode choices.
                    </p>
                  </article>
                  <article className="rounded-2xl border border-stone-200 bg-[linear-gradient(180deg,#fff7ef_0%,#ffffff_100%)] p-4 shadow-sm">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                      Recently removed
                    </p>
                    <p className="mt-3 text-2xl font-semibold text-stone-900">
                      {removedBooks.length}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-stone-500">
                      Recoverable titles still available from stale links or the home shelf.
                    </p>
                  </article>
                </div>

                {removedBooks.length > 0 ? (
                  <div className="rounded-[1.5rem] border border-amber-200 bg-[linear-gradient(135deg,#fff7d8_0%,#fffdf7_100%)] p-5 text-sm text-amber-950 shadow-sm">
                    <p className="font-medium">Removed books are still recoverable.</p>
                    <p className="mt-2 leading-6 text-amber-900">
                      Stale setup and player links can restore them, and the home shelf keeps a
                      recently removed list until you dismiss it.
                    </p>
                  </div>
                ) : null}
              </div>
            </StudioDisclosure>
          </div>
        </div>
      </section>
      <section className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Import review</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              The first vertical slice focuses on chapter parsing and preview before
              voice setup.
            </p>
          </div>
          <div className="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700">
            {chapters.length} chapter{chapters.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="mt-6 grid gap-4">
          {chapters.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-5 text-sm text-stone-600">
              Add text above to see parsed chapter previews here.
            </div>
          ) : (
            chapters.map((chapter) => (
              <article
                key={chapter.id}
                className="rounded-[1.4rem] border border-stone-200 bg-[linear-gradient(180deg,#faf8f4_0%,#ffffff_100%)] p-5 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-stone-900">
                    {chapter.title}
                  </h3>
                  <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-stone-500">
                    Section {chapter.order + 1}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-stone-600">
                  {chapter.text.slice(0, 220) || "No chapter body found yet."}
                </p>
              </article>
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}
