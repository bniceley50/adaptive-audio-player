"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/shared/app-shell";
import { EngineChoice } from "@/components/voices/engine-choice";
import { VoiceChoice } from "@/components/voices/voice-choice";
import type {
  PublicGenerationOutputSummary,
  SyncJobSummary,
} from "@/lib/backend/types";
import {
  BooksApiError,
  cacheBookMetadata,
  getBook,
  type BookDetail,
} from "@/lib/client/books-api";
import {
  resolveSampleGenerationState,
  writeLocalSampleRequest,
  type LocalSampleRequest,
} from "@/lib/library/local-library";
import {
  getVoiceCatalogEntry,
  getVoicesForNarrationEngine,
  voiceSupportsNarrationEngine,
  type VoiceId,
} from "@/lib/voices/catalog";
import {
  FAST_NARRATION_ENGINE_ID,
  NARRATION_ENGINE_CATALOG,
  type NarrationEngineId,
} from "@/lib/narration/engines";

interface BookPageProps {
  params: Promise<{ bookId: string }>;
}

interface BookJobsPayload {
  artifacts?: PublicGenerationOutputSummary[];
  jobs?: SyncJobSummary[];
  outputs?: PublicGenerationOutputSummary[];
}

type BookLoadStatus = "loading" | "ready" | "missing" | "error";
type StartingAction = "sample" | "full-book" | null;

const narrationMode = "classic";
const primaryActionClass =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-[#274c5b] px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_-24px_rgba(39,76,91,0.9)] transition hover:bg-[#1f3d49] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600";
const secondaryActionClass =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:bg-stone-50";

function isActive(job: SyncJobSummary | null) {
  return job?.status === "queued" || job?.status === "running";
}

function isTerminal(job: SyncJobSummary) {
  return (
    job.status === "completed" ||
    job.status === "failed" ||
    job.status === "cancelled"
  );
}

function isExactPlayableOutput(
  output: PublicGenerationOutputSummary | null,
  input: {
    bookId: string;
    kind: "sample-generation" | "full-book-generation";
    engineId: NarrationEngineId;
    voiceId: VoiceId | null;
  },
) {
  return Boolean(
    input.voiceId &&
      output?.bookId === input.bookId &&
      output.kind === input.kind &&
      (output.engineId ?? FAST_NARRATION_ENGINE_ID) === input.engineId &&
      output.narratorId === input.voiceId &&
      output.mode === narrationMode &&
      output.isCurrent &&
      output.artifactId?.trim() &&
      output.jobId?.trim() &&
      output.artifactUrl.startsWith("/api/audio/"),
  );
}

async function readErrorMessage(response: Response | null, fallback: string) {
  if (!response) {
    return fallback;
  }

  const payload = (await response.json().catch(() => null)) as
    | { error?: unknown }
    | null;
  return typeof payload?.error === "string" && payload.error.trim()
    ? payload.error
    : fallback;
}

export default function BookPage({ params }: BookPageProps) {
  const { bookId } = use(params);
  const selectedVoiceTouchedRef = useRef(false);
  const [book, setBook] = useState<BookDetail | null>(null);
  const [bookLoadStatus, setBookLoadStatus] =
    useState<BookLoadStatus>("loading");
  const [selectedEngineId, setSelectedEngineId] =
    useState<NarrationEngineId>(FAST_NARRATION_ENGINE_ID);
  const [selectedVoiceId, setSelectedVoiceId] = useState<VoiceId | null>(null);
  const [sampleRequest, setSampleRequest] =
    useState<LocalSampleRequest | null>(null);
  const [sampleJob, setSampleJob] = useState<SyncJobSummary | null>(null);
  const [fullBookJob, setFullBookJob] = useState<SyncJobSummary | null>(null);
  const [sampleOutput, setSampleOutput] =
    useState<PublicGenerationOutputSummary | null>(null);
  const [fullBookOutput, setFullBookOutput] =
    useState<PublicGenerationOutputSummary | null>(null);
  const [startingAction, setStartingAction] =
    useState<StartingAction>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [jobsLoadError, setJobsLoadError] = useState<string | null>(null);

  const bookTitle = book?.title ?? "Book setup";
  const selectedEngine =
    NARRATION_ENGINE_CATALOG.find(
      (engine) => engine.id === selectedEngineId,
    ) ?? NARRATION_ENGINE_CATALOG[0];
  const selectedVoice = getVoiceCatalogEntry(selectedVoiceId);
  const sampleGenerationState = resolveSampleGenerationState({
    bookId,
    engineId: selectedEngineId,
    narratorId: selectedVoiceId ?? "",
    mode: narrationMode,
    request: sampleRequest,
    job: sampleJob,
    output: sampleOutput,
  });
  const sampleJobIsActive = isActive(sampleJob);
  const fullBookJobIsActive = isActive(fullBookJob);
  const sampleIsReady = sampleGenerationState.isPlayable;
  const fullBookIsReady = isExactPlayableOutput(fullBookOutput, {
    bookId,
    kind: "full-book-generation",
    engineId: selectedEngineId,
    voiceId: selectedVoiceId,
  });
  const sampleJobMatchesSelection = Boolean(
    selectedVoiceId &&
      sampleJob?.bookId === bookId &&
      (sampleJob.engineId ?? FAST_NARRATION_ENGINE_ID) === selectedEngineId &&
      sampleJob.narratorId === selectedVoiceId &&
      sampleJob.mode === narrationMode,
  );
  const fullBookJobMatchesSelection = Boolean(
    selectedVoiceId &&
      fullBookJob?.bookId === bookId &&
      (fullBookJob.engineId ?? FAST_NARRATION_ENGINE_ID) === selectedEngineId &&
      fullBookJob.narratorId === selectedVoiceId &&
      fullBookJob.mode === narrationMode,
  );
  const sampleFailed = Boolean(
    sampleJobMatchesSelection &&
      (sampleJob?.status === "failed" || sampleJob?.status === "cancelled"),
  );
  const fullBookFailed = Boolean(
    fullBookJobMatchesSelection &&
      (fullBookJob?.status === "failed" || fullBookJob?.status === "cancelled"),
  );
  const currentStep =
    fullBookIsReady || fullBookJobIsActive || fullBookFailed || sampleIsReady
      ? 3
      : sampleJobIsActive || sampleFailed
        ? 2
        : 1;

  const loadBookJobs = useCallback(async () => {
    const response = await fetch(
      `/api/jobs/book/${encodeURIComponent(bookId)}`,
      {
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      },
    ).catch(() => null);

    if (!response?.ok) {
      setJobsLoadError(
        "Saved audio status could not be loaded. You can retry by reloading this page.",
      );
      return;
    }

    const payload = (await response.json().catch(() => null)) as
      | BookJobsPayload
      | null;
    if (!payload) {
      setJobsLoadError(
        "Saved audio status could not be loaded. You can retry by reloading this page.",
      );
      return;
    }

    const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    const outputs = Array.isArray(payload.outputs) ? payload.outputs : [];
    const nextSampleJob =
      jobs.find((job) => job.kind === "sample-generation") ?? null;
    const nextFullBookJob =
      jobs.find((job) => job.kind === "full-book-generation") ?? null;
    const nextSampleOutput =
      outputs.find((output) => output.kind === "sample-generation") ?? null;
    const nextFullBookOutput =
      outputs.find((output) => output.kind === "full-book-generation") ?? null;

    setSampleJob(nextSampleJob);
    setFullBookJob(nextFullBookJob);
    setSampleOutput(nextSampleOutput);
    setFullBookOutput(nextFullBookOutput);
    setJobsLoadError(null);

    const savedVoice = getVoiceCatalogEntry(
      nextSampleJob?.narratorId ??
        nextSampleOutput?.narratorId ??
        nextFullBookOutput?.narratorId,
    );
    const savedEngineId =
      nextSampleJob?.engineId ??
      nextSampleOutput?.engineId ??
      nextFullBookOutput?.engineId ??
      FAST_NARRATION_ENGINE_ID;
    if (savedVoice && !selectedVoiceTouchedRef.current) {
      setSelectedEngineId(savedEngineId);
      setSelectedVoiceId(savedVoice.id);
      setSampleRequest({
        bookId,
        engineId: savedEngineId,
        narratorId: savedVoice.id,
        mode: narrationMode,
      });
    }
  }, [bookId]);

  useEffect(() => {
    const controller = new AbortController();

    void getBook(bookId, { signal: controller.signal })
      .then((loadedBook) => {
        setBook(loadedBook);
        cacheBookMetadata(loadedBook);
        setBookLoadStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setBook(null);
        setBookLoadStatus(
          error instanceof BooksApiError && error.status === 404
            ? "missing"
            : "error",
        );
      });

    return () => controller.abort();
  }, [bookId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadBookJobs(), 0);

    return () => window.clearTimeout(timer);
  }, [loadBookJobs]);

  useEffect(() => {
    if (!sampleJobIsActive || !sampleJob) {
      return;
    }

    const jobId = sampleJob.id;
    let requestInFlight = false;
    let cancelled = false;

    async function poll() {
      if (requestInFlight) {
        return;
      }
      requestInFlight = true;

      const response = await fetch(
        `/api/jobs/sample-generation/${encodeURIComponent(jobId)}`,
        {
          cache: "no-store",
          credentials: "same-origin",
          headers: { accept: "application/json" },
        },
      ).catch(() => null);
      const payload = response?.ok
        ? ((await response.json().catch(() => null)) as
            | { job?: SyncJobSummary }
            | null)
        : null;
      requestInFlight = false;

      if (cancelled || !payload?.job) {
        return;
      }

      setSampleJob(payload.job);
      if (isTerminal(payload.job)) {
        await loadBookJobs();
      }
    }

    const timer = window.setInterval(() => void poll(), 750);
    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loadBookJobs, sampleJob, sampleJobIsActive]);

  useEffect(() => {
    if (!fullBookJobIsActive || !fullBookJob) {
      return;
    }

    const jobId = fullBookJob.id;
    let requestInFlight = false;
    let cancelled = false;

    async function poll() {
      if (requestInFlight) {
        return;
      }
      requestInFlight = true;

      const response = await fetch(
        `/api/jobs/full-book-generation/${encodeURIComponent(jobId)}`,
        {
          cache: "no-store",
          credentials: "same-origin",
          headers: { accept: "application/json" },
        },
      ).catch(() => null);
      const payload = response?.ok
        ? ((await response.json().catch(() => null)) as
            | { job?: SyncJobSummary }
            | null)
        : null;
      requestInFlight = false;

      if (cancelled || !payload?.job) {
        return;
      }

      setFullBookJob(payload.job);
      if (isTerminal(payload.job)) {
        await loadBookJobs();
      }
    }

    const timer = window.setInterval(() => void poll(), 750);
    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [fullBookJob, fullBookJobIsActive, loadBookJobs]);

  function chooseVoice(voiceId: VoiceId) {
    selectedVoiceTouchedRef.current = true;
    setSelectedVoiceId(voiceId);
    setSampleRequest(null);
    setPageError(null);
  }

  const chooseEngine = useCallback((engineId: NarrationEngineId) => {
    setSelectedEngineId(engineId);
    setSelectedVoiceId((currentVoiceId) => {
      if (voiceSupportsNarrationEngine(currentVoiceId, engineId)) {
        return currentVoiceId;
      }
      return engineId === "chatterbox"
        ? (getVoicesForNarrationEngine(engineId)[0]?.id ?? null)
        : null;
    });
    setSampleRequest(null);
    setPageError(null);
  }, []);

  async function generateSample() {
    if (!selectedVoice) {
      setPageError("Choose a voice before generating a sample.");
      return;
    }

    setStartingAction("sample");
    setPageError(null);
    const request: LocalSampleRequest = {
      bookId,
      engineId: selectedEngineId,
      narratorId: selectedVoice.id,
      mode: narrationMode,
    };
    setSampleRequest(request);
    writeLocalSampleRequest(request);

    const response = await fetch("/api/jobs/sample-generation", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        bookId,
        engineId: selectedEngineId,
        narratorId: selectedVoice.id,
      }),
    }).catch(() => null);

    if (!response?.ok) {
      setPageError(
        await readErrorMessage(
          response,
          "The sample could not be started. Check local narration and try again.",
        ),
      );
      setStartingAction(null);
      await loadBookJobs();
      return;
    }

    const payload = (await response.json().catch(() => null)) as
      | { job?: SyncJobSummary }
      | null;
    if (!payload?.job) {
      setPageError("The sample could not be confirmed. Reload and try again.");
      setStartingAction(null);
      return;
    }

    setSampleJob(payload.job);
    setStartingAction(null);
  }

  async function generateFullBook() {
    if (!sampleIsReady) {
      setPageError("Listen to a current sample before creating the full audiobook.");
      return;
    }

    setStartingAction("full-book");
    setPageError(null);
    const response = await fetch("/api/jobs/full-book-generation", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ bookId }),
    }).catch(() => null);

    if (!response?.ok) {
      setPageError(
        await readErrorMessage(
          response,
          "The full audiobook could not be started. Try again.",
        ),
      );
      setStartingAction(null);
      await loadBookJobs();
      return;
    }

    const payload = (await response.json().catch(() => null)) as
      | { job?: SyncJobSummary }
      | null;
    if (!payload?.job) {
      setPageError("The full audiobook could not be confirmed. Reload and try again.");
      setStartingAction(null);
      return;
    }

    setFullBookJob(payload.job);
    setStartingAction(null);
  }

  if (bookLoadStatus === "loading") {
    return (
      <AppShell eyebrow="Book setup" title="Loading book…">
        <section
          aria-live="polite"
          className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-xl font-semibold text-stone-950">
            Preparing voice choices
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            Your book and saved audio are loading.
          </p>
        </section>
      </AppShell>
    );
  }

  if (bookLoadStatus === "missing" || bookLoadStatus === "error" || !book) {
    return (
      <AppShell eyebrow="Book setup" title="This book could not be opened">
        <section className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-stone-950">
            {bookLoadStatus === "missing"
              ? "The book is no longer in your library"
              : "The book could not be loaded"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            {bookLoadStatus === "missing"
              ? "Return to your library and choose another book."
              : "Reload this page, or return to your library and try again."}
          </p>
          <Link className={`${primaryActionClass} mt-5`} href="/">
            Back to library
          </Link>
        </section>
      </AppShell>
    );
  }

  const failureTitle = fullBookFailed
    ? "The full audiobook stopped before it was ready"
    : sampleFailed
      ? "The sample stopped before it was ready"
      : pageError || jobsLoadError
        ? "Something needs attention"
        : null;
  const failureDetail = fullBookFailed
    ? fullBookJob?.errorMessage ?? "Create the full audiobook again."
    : sampleFailed
      ? sampleJob?.errorMessage ?? "Create the sample again."
      : pageError ?? jobsLoadError;

  return (
    <AppShell eyebrow="Book setup" title={bookTitle}>
      <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-[0_24px_70px_-46px_rgba(28,25,23,0.4)]">
        <div className="border-b border-stone-200 bg-[linear-gradient(135deg,#fff8e8_0%,#ffffff_50%,#eef7f5_100%)] p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">
                Three simple steps
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-950 sm:text-3xl">
                Choose a voice, hear a sample, then create your audiobook
              </h2>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                Your source is ready. Nothing is generated until you choose a voice
                and start the next step.
              </p>
            </div>
            <div className="rounded-[1.25rem] border border-white bg-white/85 px-4 py-3 text-sm text-stone-700 shadow-sm">
              <span className="block font-semibold text-stone-950">
                {book.chapterCount} chapter{book.chapterCount === 1 ? "" : "s"}
              </span>
              <span className="mt-1 block">Ready to narrate</span>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <ol aria-label="Audiobook setup progress" className="grid gap-5">
            <li aria-current={currentStep === 1 ? "step" : undefined}>
              <article className="rounded-[1.6rem] border border-stone-200 bg-stone-50/70 p-5 sm:p-6">
                <div className="mb-5 flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-950 text-sm font-semibold text-white">
                    1
                  </span>
                  <div>
                    <p className="font-semibold text-stone-950">
                      Choose quality and voice
                    </p>
                    <p className="text-sm text-stone-600">
                      Check compatibility, then preview any voice.
                    </p>
                  </div>
                </div>
                <div className="space-y-6">
                  <EngineChoice
                    disabled={sampleJobIsActive || fullBookJobIsActive}
                    onEngineChange={chooseEngine}
                    selectedEngineId={selectedEngineId}
                  />
                  <div className="border-t border-stone-200 pt-6">
                    <VoiceChoice
                      disabled={sampleJobIsActive || fullBookJobIsActive}
                      key={selectedEngineId}
                      narrationEngineId={selectedEngineId}
                      onVoiceChange={chooseVoice}
                      selectedVoiceId={selectedVoiceId}
                    />
                  </div>
                </div>
              </article>
            </li>

            <li aria-current={currentStep === 2 ? "step" : undefined}>
              <article className="rounded-[1.6rem] border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-950 text-sm font-semibold text-white">
                    2
                  </span>
                  <div>
                    <p className="font-semibold text-stone-950">Hear a sample</p>
                    <p className="text-sm text-stone-600">
                      Confirm the voice before creating the whole book.
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-[1.25rem] border border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-700">
                  {sampleIsReady && sampleOutput ? (
                    <>
                      <p className="font-semibold text-stone-950">
                        Your {selectedVoice?.displayName ?? "selected"} sample is ready
                      </p>
                      <audio
                        aria-label={`${selectedVoice?.displayName ?? "Selected voice"} sample`}
                        className="mt-3 w-full"
                        controls
                        preload="metadata"
                        src={sampleOutput.artifactUrl}
                      />
                      <Link
                        className={`${secondaryActionClass} mt-3`}
                        href={`/player/${encodeURIComponent(bookId)}?artifact=sample`}
                      >
                        Listen to sample
                      </Link>
                    </>
                  ) : sampleJobIsActive || startingAction === "sample" ? (
                    <p aria-live="polite">
                      Creating a short {selectedEngine.label} sample with {selectedVoice?.displayName ?? "your voice"}…
                    </p>
                  ) : (
                    <p>
                      {selectedVoice
                        ? `${selectedVoice.displayName} and ${selectedEngine.label} are selected. Generate a short sample when you are ready.`
                        : "Choose a voice above to unlock sample generation."}
                    </p>
                  )}
                </div>
              </article>
            </li>

            <li aria-current={currentStep === 3 ? "step" : undefined}>
              <article className="rounded-[1.6rem] border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-950 text-sm font-semibold text-white">
                    3
                  </span>
                  <div>
                    <p className="font-semibold text-stone-950">Create your audiobook</p>
                    <p className="text-sm text-stone-600">
                      Use the same voice you approved in the sample.
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-[1.25rem] border border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-700">
                  {fullBookIsReady ? (
                    <p className="font-semibold text-emerald-900">
                      Your full audiobook is ready to listen to.
                    </p>
                  ) : fullBookJobIsActive || startingAction === "full-book" ? (
                    <div aria-live="polite">
                      <p>Creating your full audiobook…</p>
                      {fullBookJob?.renderProgress ? (
                        <p className="mt-1 text-stone-600">
                          {fullBookJob.renderProgress.completedChapters} of{" "}
                          {fullBookJob.renderProgress.totalChapters} chapters complete
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p>
                      {sampleIsReady
                        ? "If the sample sounds right, create the complete audiobook."
                        : "A current sample is required before the complete audiobook can be created."}
                    </p>
                  )}
                </div>
              </article>
            </li>
          </ol>

          {failureTitle && failureDetail ? (
            <section
              className="mt-5 rounded-[1.4rem] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"
              role="alert"
            >
              <p className="font-semibold">{failureTitle}</p>
              <p className="mt-1 text-rose-800">
                Your book is safe. Use the main action below to try again.
              </p>
              <details className="mt-3">
                <summary className="cursor-pointer font-medium underline underline-offset-4">
                  Show details
                </summary>
                <p className="mt-2 break-words text-rose-800">{failureDetail}</p>
              </details>
            </section>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-stone-200 pt-6">
            {fullBookIsReady ? (
              <Link
                className={primaryActionClass}
                href={`/player/${encodeURIComponent(bookId)}?artifact=full`}
              >
                Listen to full audiobook
              </Link>
            ) : fullBookJobIsActive || startingAction === "full-book" ? (
              <button className={primaryActionClass} disabled type="button">
                Creating full audiobook…
              </button>
            ) : fullBookFailed ? (
              <button
                className={primaryActionClass}
                type="button"
                onClick={() => void generateFullBook()}
              >
                Try full audiobook again
              </button>
            ) : sampleIsReady ? (
              <button
                className={primaryActionClass}
                type="button"
                onClick={() => void generateFullBook()}
              >
                Generate full audiobook
              </button>
            ) : sampleJobIsActive || startingAction === "sample" ? (
              <button className={primaryActionClass} disabled type="button">
                Generating sample…
              </button>
            ) : (
              <button
                className={primaryActionClass}
                disabled={!selectedVoiceId}
                type="button"
                onClick={() => void generateSample()}
              >
                {sampleFailed || sampleGenerationState.status === "missing-artifact"
                  ? "Try sample again"
                  : "Generate sample"}
              </button>
            )}

            <Link className={secondaryActionClass} href="/">
              Back to library
            </Link>
          </div>

          <details className="mt-5 rounded-[1.25rem] border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
            <summary className="cursor-pointer font-semibold text-stone-900">
              Review chapter titles
            </summary>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              {book.chapters.map((chapter) => (
                <li key={chapter.id}>{chapter.title}</li>
              ))}
            </ol>
          </details>
        </div>
      </section>
    </AppShell>
  );
}
