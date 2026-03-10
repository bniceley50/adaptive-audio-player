import Link from "next/link";

import { JobsAutoRefresh } from "@/components/library/jobs-auto-refresh";
import { RetryJobButton } from "@/components/library/retry-job-button";
import { AppShell } from "@/components/shared/app-shell";
import {
  getGenerationArtifactForJob,
  getGenerationOutputForBookKind,
  getSyncedBookDisplayMeta,
  getUserById,
  listRecentSyncJobsForUser,
  listRecentSyncJobsForWorkspace,
} from "@/lib/backend/sqlite";
import {
  readAccountIdFromRequest,
  readWorkspaceIdFromRequest,
} from "@/lib/backend/workspace-session";

function describeJob(job: {
  kind: string;
  bookId: string | null;
  bookTitle: string | null;
  narratorId: string | null;
  mode: string | null;
  chapterCount: number | null;
  books: number;
  profiles: number;
  playbackStates: number;
}) {
  const bookLabel = job.bookTitle ?? job.bookId ?? "unknown";

  if (job.kind === "sample-generation") {
    return `Book ${bookLabel} · Narrator ${job.narratorId ?? "unknown"} · Mode ${job.mode ?? "unknown"}`;
  }

  if (job.kind === "full-book-generation") {
    return `Book ${bookLabel} · Chapters ${job.chapterCount ?? 0}`;
  }

  return `Books ${job.books} · Profiles ${job.profiles} · Playback ${job.playbackStates}`;
}

function labelJobKind(kind: string) {
  if (kind === "sample-generation") {
    return "Sample generation";
  }

  if (kind === "full-book-generation") {
    return "Full-book generation";
  }

  return "Library sync";
}

function labelProvider(provider: "openai" | "mock") {
  return provider === "openai" ? "OpenAI TTS" : "Local mock TTS";
}

function buildArtifactPlayerHref(input: {
  artifactId: string;
  artifactKind: "sample-generation" | "full-book-generation";
  bookId: string;
  narratorId: string | null;
  mode: string | null;
  renderState: "current" | "archived";
}) {
  const params = new URLSearchParams({
    artifactId: input.artifactId,
    artifactKind: input.artifactKind,
    renderState: input.renderState,
  });

  if (input.narratorId) {
    params.set("narrator", input.narratorId);
  }

  if (input.mode) {
    params.set("mode", input.mode);
  }

  return `/player/${input.bookId}?${params.toString()}`;
}

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

export default async function JobsPage() {
  const workspaceId = await readWorkspaceIdFromRequest();
  const accountId = await readAccountIdFromRequest();
  const currentUser = accountId ? getUserById(accountId) : null;
  const jobs = currentUser
    ? listRecentSyncJobsForUser(currentUser.id, 25)
    : workspaceId
      ? listRecentSyncJobsForWorkspace(workspaceId, 25)
      : [];
  const latestGenerationOutputsByBookKey = new Map<
    string,
    ReturnType<typeof getGenerationOutputForBookKind>
  >();
  const generationArtifactsByJobId = new Map<
    string,
    ReturnType<typeof getGenerationArtifactForJob>
  >();

  for (const job of jobs) {
    if (
      job.bookId &&
      (job.kind === "sample-generation" || job.kind === "full-book-generation")
    ) {
      latestGenerationOutputsByBookKey.set(
        `${job.workspaceId}:${job.bookId}:${job.kind}`,
        getGenerationOutputForBookKind(job.workspaceId, job.bookId, job.kind),
      );
      generationArtifactsByJobId.set(
        job.id,
        getGenerationArtifactForJob(job.id, job.workspaceId),
      );
    }
  }

  const hasPendingJobs = jobs.some(
    (job) => job.status === "queued" || job.status === "running",
  );
  const queuedJobs = jobs.filter((job) => job.status === "queued").length;
  const runningJobs = jobs.filter((job) => job.status === "running").length;
  const completedJobs = jobs.filter((job) => job.status === "completed").length;
  const failedJobs = jobs.filter((job) => job.status === "failed").length;
  const renderTimelineByBook = new Map<
    string,
    {
      bookId: string;
      bookTitle: string;
      coverTheme: string | null;
      coverLabel: string | null;
      coverGlyph: string | null;
      genreLabel: string | null;
      renders: Array<{
        jobId: string;
        kind: "sample-generation" | "full-book-generation";
        generatedAt: string;
        narratorId: string | null;
        mode: string | null;
        provider: "openai" | "mock";
        isCurrent: boolean;
        playerHref: string;
      }>;
    }
  >();

  for (const job of jobs) {
    if (
      !job.bookId ||
      (job.kind !== "sample-generation" && job.kind !== "full-book-generation")
    ) {
      continue;
    }

    const artifact = generationArtifactsByJobId.get(job.id);
    if (!artifact) {
      continue;
    }

    const latestOutput = latestGenerationOutputsByBookKey.get(
      `${job.workspaceId}:${job.bookId}:${job.kind}`,
    );
    const syncedBookMeta = getSyncedBookDisplayMeta(job.workspaceId, job.bookId);
    const bookKey = `${job.workspaceId}:${job.bookId}`;
    const existing = renderTimelineByBook.get(bookKey) ?? {
      bookId: job.bookId,
      bookTitle: syncedBookMeta?.title ?? job.bookTitle ?? job.bookId,
      coverTheme: syncedBookMeta?.coverTheme ?? null,
      coverLabel: syncedBookMeta?.coverLabel ?? null,
      coverGlyph: syncedBookMeta?.coverGlyph ?? null,
      genreLabel: syncedBookMeta?.genreLabel ?? null,
      renders: [],
    };

    existing.renders.push({
      jobId: job.id,
      kind: artifact.kind,
      generatedAt: artifact.generatedAt,
      narratorId: artifact.narratorId,
      mode: artifact.mode,
      provider: artifact.provider,
      isCurrent: !!latestOutput && latestOutput.assetPath === artifact.assetPath,
      playerHref: buildArtifactPlayerHref({
        artifactId: artifact.id,
        artifactKind: artifact.kind,
        bookId: job.bookId,
        narratorId: artifact.narratorId,
        mode: artifact.mode,
        renderState:
          !!latestOutput && latestOutput.assetPath === artifact.assetPath
            ? "current"
            : "archived",
      }),
    });

    renderTimelineByBook.set(bookKey, existing);
  }

  const renderTimelines = Array.from(renderTimelineByBook.values())
    .map((timeline) => ({
      ...timeline,
      renders: timeline.renders.sort(
        (left, right) =>
          new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime(),
      ),
    }))
    .sort(
      (left, right) =>
        new Date(right.renders[0]?.generatedAt ?? 0).getTime() -
        new Date(left.renders[0]?.generatedAt ?? 0).getTime(),
    );
  const jobsState = failedJobs > 0
    ? {
        label: "Queue needs attention",
        detail:
          "At least one backend job failed. Review the failed cards first, then retry or inspect the affected book.",
        action: "Start with the failed jobs below",
      }
    : hasPendingJobs
      ? {
          label: "Queue is actively processing",
          detail:
            "The worker is currently handling generation or sync jobs, so this page is the live control surface for backend progress.",
          action: "Watch the running jobs and refresh state here",
        }
      : completedJobs > 0
        ? {
            label: "Queue is healthy",
            detail:
              "Recent jobs completed successfully, and the system has preserved render history you can open from here.",
            action: "Review completed renders or jump into a book timeline",
          }
        : {
            label: "Queue is ready",
            detail:
              "No jobs are active yet. The next generation or sync event will show up here with full backend history.",
            action: "Create a sample or full-book render from a book setup page",
          };

  return (
    <AppShell eyebrow="Backend jobs" title="Generation and sync history">
      <JobsAutoRefresh hasPendingJobs={hasPendingJobs} />
      <section className="rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#fffefb_0%,#ffffff_42%,#eef4ff_100%)] p-6 shadow-[0_24px_70px_-46px_rgba(28,25,23,0.42)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              Current state
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-950">
              {jobsState.label}
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {jobsState.detail}
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-white/80 bg-white/85 px-4 py-4 shadow-sm backdrop-blur">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
              Next action
            </p>
            <p className="mt-2 max-w-xs text-base font-semibold text-stone-950">
              {jobsState.action}
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <article className="rounded-[1.5rem] border border-stone-200/80 bg-white/85 p-4 shadow-sm">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
              Live jobs
            </p>
            <p className="mt-2 text-2xl font-semibold text-stone-950">
              {queuedJobs + runningJobs}
            </p>
          </article>
          <article className="rounded-[1.5rem] border border-stone-200/80 bg-white/85 p-4 shadow-sm">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
              Completed
            </p>
            <p className="mt-2 text-2xl font-semibold text-stone-950">{completedJobs}</p>
          </article>
          <article className="rounded-[1.5rem] border border-stone-200/80 bg-white/85 p-4 shadow-sm">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
              Failed
            </p>
            <p className="mt-2 text-2xl font-semibold text-stone-950">{failedJobs}</p>
          </article>
          <article className="rounded-[1.5rem] border border-stone-200/80 bg-white/85 p-4 shadow-sm">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
              Render timelines
            </p>
            <p className="mt-2 text-2xl font-semibold text-stone-950">
              {renderTimelines.length}
            </p>
          </article>
        </div>
      </section>
      <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(180deg,#fffefb_0%,#ffffff_100%)] shadow-[0_24px_70px_-46px_rgba(28,25,23,0.42)]">
        <div className="border-b border-stone-200/80 bg-[linear-gradient(135deg,#f7ecd8_0%,#fffdf7_48%,#eef4ff_100%)] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
                Queue orchestration
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-stone-950">
                Recent backend jobs
              </h2>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                Track library syncs, sample rendering, and full-book generation in one
                premium control surface. This is where the product proves it has real
                backend depth, not just a pretty player.
              </p>
            </div>
            <Link
              className="rounded-full border border-stone-300 bg-white/80 px-4 py-2 text-sm font-medium text-stone-700 shadow-sm backdrop-blur transition hover:border-stone-400 hover:bg-white"
              href="/"
            >
              Back home
            </Link>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[1.4rem] border border-white/70 bg-white/75 px-4 py-4 shadow-sm backdrop-blur">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
                Queued
              </p>
              <p className="mt-2 text-2xl font-semibold text-stone-950">{queuedJobs}</p>
              <p className="mt-1 text-sm text-stone-600">Waiting for the worker to claim.</p>
            </div>
            <div className="rounded-[1.4rem] border border-white/70 bg-white/75 px-4 py-4 shadow-sm backdrop-blur">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
                Running
              </p>
              <p className="mt-2 text-2xl font-semibold text-stone-950">{runningJobs}</p>
              <p className="mt-1 text-sm text-stone-600">Currently active in the background worker.</p>
            </div>
            <div className="rounded-[1.4rem] border border-white/70 bg-white/75 px-4 py-4 shadow-sm backdrop-blur">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
                Completed
              </p>
              <p className="mt-2 text-2xl font-semibold text-stone-950">{completedJobs}</p>
              <p className="mt-1 text-sm text-stone-600">Finished jobs with history preserved.</p>
            </div>
            <div className="rounded-[1.4rem] border border-white/70 bg-white/75 px-4 py-4 shadow-sm backdrop-blur">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
                Failed
              </p>
              <p className="mt-2 text-2xl font-semibold text-stone-950">{failedJobs}</p>
              <p className="mt-1 text-sm text-stone-600">Recovery-ready jobs that need attention.</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          {renderTimelines.length > 0 ? (
            <section className="mb-6 rounded-[1.8rem] border border-stone-200 bg-[linear-gradient(180deg,#fffdfa_0%,#ffffff_100%)] p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
                    Render timeline
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-stone-950">
                    Per-book generation history
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    See every preserved sample and full-book render grouped by title,
                    with the current playable version called out explicitly.
                  </p>
                </div>
                <div className="rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-sm text-stone-600">
                  {renderTimelines.length} title{renderTimelines.length === 1 ? "" : "s"} with
                  preserved renders
                </div>
              </div>
              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {renderTimelines.map((timeline) => (
                  <article
                    key={timeline.bookId}
                    className="rounded-[1.5rem] border border-stone-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div
                          className={`flex h-24 w-20 shrink-0 flex-col justify-between overflow-hidden rounded-[1.2rem] border border-stone-200 bg-gradient-to-br ${timeline.coverTheme ?? getBookCoverTheme(timeline.bookTitle)} p-3 shadow-sm`}
                        >
                          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-stone-600">
                            {timeline.coverLabel ?? "Renders"}
                          </p>
                          <p className="text-xl font-semibold tracking-tight text-stone-950">
                            {timeline.coverGlyph ?? getBookInitials(timeline.bookTitle)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                            Title
                          </p>
                          <h4 className="mt-2 text-xl font-semibold text-stone-950">
                            {timeline.bookTitle}
                          </h4>
                          {timeline.genreLabel ? (
                            <span className="mt-3 inline-flex rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-fuchsia-700">
                              {timeline.genreLabel}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <Link
                        className="rounded-full border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                        href={`/books/${timeline.bookId}`}
                      >
                        Open book
                      </Link>
                    </div>
                    <div className="mt-4 grid gap-3">
                      {timeline.renders.map((render) => (
                        <div
                          key={render.jobId}
                          className="rounded-[1.25rem] border border-stone-200 bg-stone-50 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-stone-900 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white">
                                  {render.kind === "full-book-generation"
                                    ? "Full book"
                                    : "Sample"}
                                </span>
                                {render.isCurrent ? (
                                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-emerald-800">
                                    Current
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-stone-200 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-stone-700">
                                    Archived
                                  </span>
                                )}
                              </div>
                              <p className="mt-3 text-sm font-medium text-stone-900">
                                {render.narratorId ? `Narrator ${render.narratorId}` : "Narrator unknown"}
                                {render.mode ? ` · ${render.mode}` : ""}
                              </p>
                              <p className="mt-1 text-sm text-stone-600">
                                {labelProvider(render.provider)} ·{" "}
                                {new Date(render.generatedAt).toLocaleString()}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Link
                                className="rounded-full border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                                href={render.playerHref}
                              >
                                {render.kind === "full-book-generation"
                                  ? render.isCurrent
                                    ? "Listen current full book"
                                    : "Open full-book render"
                                  : render.isCurrent
                                    ? "Open current sample"
                                    : "Open sample render"}
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          {hasPendingJobs ? (
            <div className="mb-6 rounded-[1.5rem] border border-amber-200 bg-[linear-gradient(180deg,#fff9eb_0%,#ffffff_100%)] px-5 py-4 text-sm text-amber-950 shadow-sm">
              <p className="font-medium">Live queue activity in progress</p>
              <p className="mt-2 text-amber-800">
                This page is refreshing automatically while queued and running jobs are active.
              </p>
            </div>
          ) : null}

          {jobs.length > 0 ? (
            <div className="grid gap-4">
              {jobs.map((job) => {
                const generationArtifact =
                  job.kind === "sample-generation" || job.kind === "full-book-generation"
                    ? generationArtifactsByJobId.get(job.id) ?? null
                    : null;
                const latestGenerationOutput =
                  job.bookId &&
                  (job.kind === "sample-generation" || job.kind === "full-book-generation")
                    ? latestGenerationOutputsByBookKey.get(
                        `${job.workspaceId}:${job.bookId}:${job.kind}`,
                      ) ?? null
                    : null;
                const isCurrentArtifact =
                  !!generationArtifact &&
                  !!latestGenerationOutput &&
                  generationArtifact.assetPath === latestGenerationOutput.assetPath;
                const isCurrentWorkspaceJob = job.workspaceId === workspaceId;
                const hasArtifact = !!generationArtifact?.assetPath;
                const artifactPlayerHref =
                  generationArtifact && job.bookId
                    ? buildArtifactPlayerHref({
                        artifactId: generationArtifact.id,
                        artifactKind: generationArtifact.kind,
                        bookId: job.bookId,
                        narratorId: generationArtifact.narratorId,
                        mode: generationArtifact.mode,
                        renderState: isCurrentArtifact ? "current" : "archived",
                      })
                    : null;

                return (
                  <article
                    key={job.id}
                    className="rounded-[1.7rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] px-5 py-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="max-w-2xl">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                          {labelJobKind(job.kind)}
                        </p>
                        <h3 className="mt-2 text-xl font-semibold text-stone-950">
                          {job.status === "completed"
                            ? `${labelJobKind(job.kind)} completed`
                            : `${labelJobKind(job.kind)} ${job.status}`}
                        </h3>
                        <p className="mt-3 text-sm leading-6 text-stone-600">{describeJob(job)}</p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] ${
                          job.status === "completed"
                            ? "bg-emerald-100 text-emerald-800"
                            : job.status === "failed"
                              ? "bg-rose-100 text-rose-800"
                              : job.status === "running"
                                ? "bg-sky-100 text-sky-800"
                                : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {job.status}
                      </span>
                    </div>
                    {job.errorMessage ? (
                      <div className="mt-4 rounded-[1.4rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                        {job.errorMessage}
                      </div>
                    ) : null}
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-[1.3rem] border border-stone-200 bg-white px-4 py-3 shadow-sm">
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                          Workspace
                        </p>
                        <p className="mt-2 text-sm font-medium text-stone-900">
                          {job.workspaceId.slice(0, 12)}…
                        </p>
                      </div>
                      <div className="rounded-[1.3rem] border border-stone-200 bg-white px-4 py-3 shadow-sm">
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                          Created
                        </p>
                        <p className="mt-2 text-sm font-medium text-stone-900">
                          {new Date(job.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="rounded-[1.3rem] border border-stone-200 bg-white px-4 py-3 shadow-sm">
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                          Completed
                        </p>
                        <p className="mt-2 text-sm font-medium text-stone-900">
                          {job.completedAt
                            ? new Date(job.completedAt).toLocaleString()
                            : "Still in progress"}
                        </p>
                      </div>
                      <div className="rounded-[1.3rem] border border-stone-200 bg-white px-4 py-3 shadow-sm">
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                          Artifact
                        </p>
                        <p className="mt-2 text-sm font-medium text-stone-900">
                          {generationArtifact
                            ? labelProvider(generationArtifact.provider)
                            : job.status === "completed" &&
                                (job.kind === "sample-generation" ||
                                  job.kind === "full-book-generation")
                              ? "Missing artifact"
                              : "Not applicable"}
                        </p>
                      </div>
                    </div>
                    {!generationArtifact &&
                    job.status === "completed" &&
                    (job.kind === "sample-generation" ||
                      job.kind === "full-book-generation") ? (
                      <p className="mt-4 text-sm text-amber-700">
                        Completed, but no stored audio artifact was found for this job.
                      </p>
                    ) : null}
                    {job.bookId ? (
                      <Link
                        className="mt-4 inline-flex rounded-full bg-stone-950 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-white"
                        href={job.resumePath ?? `/books/${job.bookId}`}
                      >
                        {isCurrentArtifact && job.kind === "full-book-generation"
                          ? "Current full-book output"
                          : isCurrentArtifact && job.kind === "sample-generation"
                            ? "Current sample output"
                            : generationArtifact
                              ? "Archived render"
                              : job.playableArtifactKind === "full-book-generation"
                                ? "Playable full-book output"
                                : job.playableArtifactKind === "sample-generation"
                                  ? "Playable sample output"
                                  : "Setup available"}
                      </Link>
                    ) : null}
                    {job.bookId ? (
                      <div className="mt-5 flex flex-wrap gap-3">
                        <Link
                          className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                          href={job.resumePath ?? `/books/${job.bookId}`}
                        >
                          {job.playableArtifactKind === "full-book-generation"
                            ? "Listen full book"
                            : job.playableArtifactKind === "sample-generation"
                              ? "Open sample"
                              : "Open book"}
                        </Link>
                        {!isCurrentWorkspaceJob ? (
                          <span className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-500">
                            Switch to this workspace to open audio
                          </span>
                        ) : null}
                        {job.resumePath &&
                        job.status === "completed" &&
                        job.bookId &&
                        isCurrentWorkspaceJob &&
                        isCurrentArtifact ? (
                          <Link
                            className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                            href={job.resumePath}
                          >
                            {job.kind === "full-book-generation"
                              ? "Listen in player"
                              : "Open player"}
                          </Link>
                        ) : null}
                        {job.kind === "sample-generation" &&
                        job.status === "completed" &&
                        artifactPlayerHref &&
                        isCurrentWorkspaceJob ? (
                          <Link
                            className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                            href={artifactPlayerHref}
                          >
                            {isCurrentArtifact
                              ? "Open current sample render"
                              : "Open this sample render"}
                          </Link>
                        ) : null}
                        {job.kind === "full-book-generation" &&
                        job.status === "completed" &&
                        artifactPlayerHref &&
                        isCurrentWorkspaceJob ? (
                          <Link
                            className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                            href={artifactPlayerHref}
                          >
                            {isCurrentArtifact
                              ? "Open current full-book render"
                              : "Open this full-book render"}
                          </Link>
                        ) : null}
                        {job.kind === "sample-generation" &&
                        job.status === "completed" &&
                        hasArtifact &&
                        isCurrentWorkspaceJob ? (
                          <Link
                            className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                            href={`/api/audio/generated/artifacts/${generationArtifact?.id}`}
                            target="_blank"
                          >
                            {isCurrentArtifact ? "Download current sample" : "Download this render"}
                          </Link>
                        ) : null}
                        {job.kind === "full-book-generation" &&
                        job.status === "completed" &&
                        hasArtifact &&
                        isCurrentWorkspaceJob ? (
                          <Link
                            className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                            href={`/api/audio/generated/artifacts/${generationArtifact?.id}`}
                            target="_blank"
                          >
                            {isCurrentArtifact ? "Download current full book" : "Download this render"}
                          </Link>
                        ) : null}
                        {job.status === "failed" && job.workspaceId === workspaceId ? (
                          <RetryJobButton jobId={job.id} />
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[1.6rem] border border-dashed border-stone-300 bg-stone-50 p-6 text-sm text-stone-700">
              <p className="font-medium text-stone-950">No backend jobs yet</p>
              <p className="mt-2 leading-6">
                Import a book or trigger a generation flow to create the first queue
                history and watch the orchestration layer come alive.
              </p>
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
