import type {
  SyncJobSummary,
  WorkerHeartbeatSummary,
  WorkspaceSyncSummary,
} from "@/lib/backend/types";
import Link from "next/link";
import { ManualSyncButton } from "@/components/library/manual-sync-button";
import {
  getBookCoverTheme,
  getBookInitials,
} from "@/features/reader/shared-support";

function formatRelativeSync(updatedAt: string | null) {
  if (!updatedAt) {
    return "Not synced yet";
  }

  const diffMs = Date.now() - new Date(updatedAt).getTime();
  const diffMinutes = Math.max(Math.floor(diffMs / 60000), 0);

  if (diffMinutes < 1) {
    return "Synced just now";
  }

  if (diffMinutes < 60) {
    return `Synced ${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Synced ${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `Synced ${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function formatRelativeUpdate(updatedAt: string | null) {
  if (!updatedAt) {
    return null;
  }

  const diffMs = Date.now() - new Date(updatedAt).getTime();
  const diffMinutes = Math.max(Math.floor(diffMs / 60000), 0);

  if (diffMinutes < 1) {
    return "Updated just now";
  }

  if (diffMinutes < 60) {
    return `Updated ${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Updated ${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `Updated ${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function describeRecentJob(job: SyncJobSummary) {
  const label =
    job.kind === "sample-generation"
      ? "Sample generation"
      : job.kind === "full-book-generation"
        ? "Full-book generation"
        : "Library sync";

  return `${label} ${job.status}`;
}

function describeJobTarget(job: SyncJobSummary) {
  const bookLabel = job.bookTitle ?? job.bookId ?? "unknown";

  if (job.kind === "sample-generation") {
    return `Book ${bookLabel} · Narrator ${job.narratorId ?? "unknown"} · Mode ${job.mode ?? "unknown"}`;
  }

  if (job.kind === "full-book-generation") {
    return `Book ${bookLabel} · Chapters ${job.chapterCount ?? 0}`;
  }

  return `Books ${job.books} · Profiles ${job.profiles} · Playback ${job.playbackStates}`;
}

function formatPlaybackTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function describeSessionArtifact(
  artifactKind: "sample-generation" | "full-book-generation" | null,
) {
  if (artifactKind === "full-book-generation") {
    return {
      badge: "Full book",
      detail: "Full-book audio",
      action: "Resume full book",
    };
  }

  if (artifactKind === "sample-generation") {
    return {
      badge: "Sample",
      detail: "Sample audio",
      action: "Resume sample",
    };
  }

  return {
    badge: "Player",
    detail: "Player session",
    action: "Resume player",
  };
}

export function BackendSyncCard({
  summary,
  recentJobs,
  latestSession,
  recentSessions,
  workerHeartbeat,
  renderedAt,
}: {
  summary: WorkspaceSyncSummary | null;
  recentJobs: Array<
    SyncJobSummary & {
      coverTheme: string | null;
      coverLabel: string | null;
      coverGlyph: string | null;
      genreLabel: string | null;
    }
  >;
  latestSession:
    | {
        bookId: string;
        bookTitle: string;
        coverTheme: string | null;
        coverLabel: string | null;
        coverGlyph: string | null;
        genreLabel: string | null;
        chapterIndex: number;
        progressSeconds: number;
        artifactKind: "sample-generation" | "full-book-generation" | null;
        updatedAt: string | null;
        href: string;
      }
    | null;
  recentSessions: Array<{
    bookId: string;
    bookTitle: string;
    coverTheme: string | null;
    coverLabel: string | null;
    coverGlyph: string | null;
    genreLabel: string | null;
    chapterIndex: number;
    progressSeconds: number;
    artifactKind: "sample-generation" | "full-book-generation" | null;
    updatedAt: string | null;
    href: string;
  }>;
  workerHeartbeat: WorkerHeartbeatSummary | null;
  renderedAt: string;
}) {
  const workerLagMs = workerHeartbeat
    ? new Date(renderedAt).getTime() -
      new Date(workerHeartbeat.lastHeartbeatAt).getTime()
    : null;
  const workerState = !workerHeartbeat
    ? {
        badge: "Worker unseen",
        detail: "No worker heartbeat has been recorded yet.",
        tone: "border-amber-200 bg-amber-50 text-amber-900",
      }
    : workerLagMs !== null && workerLagMs > 30_000
      ? {
          badge: "Worker offline",
          detail: "The background worker has not checked in recently.",
          tone: "border-rose-200 bg-rose-50 text-rose-900",
        }
      : workerHeartbeat.status === "processing"
        ? {
            badge: "Worker active",
            detail: "Background generation is running right now.",
            tone: "border-sky-200 bg-sky-50 text-sky-900",
          }
        : {
            badge: "Worker healthy",
            detail: "The background worker is online and ready.",
            tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
          };
  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 bg-[linear-gradient(135deg,#eef4ff_0%,#f9f3e5_52%,#fffdfa_100%)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              Library cloud
            </p>
            <h2 className="mt-2 text-lg font-semibold text-stone-900">
              Cloud sync and render activity
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              See what is safely synced, what is ready to listen to, and what the
              render system is working on right now.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-white/80 bg-white/80 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-600 backdrop-blur">
              {summary?.lastJobStatus ?? "waiting"}
            </span>
            <Link
              className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:text-stone-950"
              href="/jobs"
            >
              Open render history
            </Link>
            <ManualSyncButton />
          </div>
        </div>
      </div>

      <div className="p-6">
      {summary ? (
        <>
        <div className="mb-4 rounded-[1.5rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] px-5 py-4 text-sm text-stone-700 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-stone-950 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white">
              What stays in sync
              </span>
              <p className="text-stone-600">
              Your library, listening progress, and generated audio are preserved so you
              can return on another browser and keep going.
              </p>
            </div>
          </div>
        <div className="grid gap-4 md:grid-cols-5">
          <article className="rounded-2xl border border-stone-200 bg-[linear-gradient(180deg,#faf7f0_0%,#ffffff_100%)] p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
              Library home
            </p>
            <p className="mt-3 text-sm font-medium text-stone-900">
              {summary.workspaceId.slice(0, 18)}…
            </p>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              The cloud home for this library’s synced books, progress, and renders.
            </p>
          </article>
          <article className="rounded-2xl border border-stone-200 bg-[linear-gradient(180deg,#f4f8ff_0%,#ffffff_100%)] p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
              Books in cloud
            </p>
            <p className="mt-3 text-2xl font-semibold text-stone-900">
              {summary.syncedBookCount}
            </p>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              Titles safely mirrored from the local shelf into the backend.
            </p>
          </article>
          <article className="rounded-2xl border border-stone-200 bg-[linear-gradient(180deg,#fff7ef_0%,#ffffff_100%)] p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
              Saved voice tastes
            </p>
            <p className="mt-3 text-2xl font-semibold text-stone-900">
              {summary.syncedProfileCount}
            </p>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              Narrator and mode choices remembered for books in this library.
            </p>
          </article>
          <article className="rounded-2xl border border-stone-200 bg-[linear-gradient(180deg,#f8f5ff_0%,#ffffff_100%)] p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
              Resume memory
            </p>
            <p className="mt-3 text-2xl font-semibold text-stone-900">
              {summary.syncedPlaybackCount}
            </p>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              Playback positions restored when the same account comes back later.
            </p>
          </article>
          <article className="rounded-2xl border border-stone-200 bg-[linear-gradient(180deg,#eefbf5_0%,#ffffff_100%)] p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
              Ready audio
            </p>
            <p className="mt-3 text-2xl font-semibold text-stone-900">
              {summary.generatedOutputCount}
            </p>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              Sample and full-book audio that is already available to stream.
            </p>
          </article>
        </div>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm text-stone-700">
          Open a book or import a draft and the workspace sync will start automatically.
        </div>
      )}

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-stone-500">
        <span>{formatRelativeSync(summary?.lastSyncedAt ?? null)}</span>
        {summary?.lastSyncedAt ? (
          <span className="rounded-full bg-stone-100 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
            Last cloud update {new Date(summary.lastSyncedAt).toLocaleString()}
          </span>
        ) : null}
      </div>

      <div className={`mt-4 rounded-[1.4rem] border px-4 py-4 text-sm shadow-sm ${workerState.tone}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em]">
              Background worker
            </p>
            <p className="mt-2 text-base font-semibold">{workerState.badge}</p>
            <p className="mt-1 leading-6 opacity-90">{workerState.detail}</p>
          </div>
          {workerHeartbeat ? (
            <div className="rounded-full border border-current/15 bg-white/70 px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] shadow-sm">
              Last heartbeat {new Date(workerHeartbeat.lastHeartbeatAt).toLocaleTimeString()}
            </div>
          ) : null}
        </div>
      </div>

      {latestSession ? (
        <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#f6fffb_100%)] p-5 text-sm text-emerald-950 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div
                className={`flex h-24 w-20 shrink-0 flex-col justify-between overflow-hidden rounded-[1.2rem] border border-emerald-200 bg-gradient-to-br ${latestSession.coverTheme ?? getBookCoverTheme(latestSession.bookTitle)} p-3 shadow-sm`}
              >
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-stone-600">
                  {latestSession.coverLabel ?? "Session"}
                </p>
                <p className="text-xl font-semibold tracking-tight text-stone-950">
                  {latestSession.coverGlyph ?? getBookInitials(latestSession.bookTitle)}
                </p>
              </div>
              <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-emerald-200 bg-white/75 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-emerald-700">
                  Continue anywhere
                </span>
                {latestSession.genreLabel ? (
                  <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-fuchsia-700">
                    {latestSession.genreLabel}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-emerald-700">
                Latest cloud listening
              </p>
              <p className="mt-3 text-base font-medium">
                {latestSession.bookTitle} · Chapter {latestSession.chapterIndex + 1} ·{" "}
                {formatPlaybackTime(latestSession.progressSeconds)}
              </p>
              <p className="mt-2 text-emerald-800">
                {describeSessionArtifact(latestSession.artifactKind).detail}
                {latestSession.updatedAt
                  ? ` · ${formatRelativeUpdate(latestSession.updatedAt)}`
                  : ""}
              </p>
              </div>
            </div>
            <Link
              className="rounded-full border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-900 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-100"
              href={latestSession.href}
            >
              {describeSessionArtifact(latestSession.artifactKind).action}
            </Link>
          </div>
        </div>
      ) : null}
      {recentSessions.length > 0 ? (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-stone-100 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-600">
                  Listening history
                </span>
              </div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">
                Recent cloud listening
              </h3>
              <p className="mt-1 text-sm text-stone-600">
                The latest listening checkpoints saved in the cloud for this library.
              </p>
            </div>
            <span className="rounded-full bg-stone-100 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
              {recentSessions.length}
            </span>
          </div>
          <div className="mt-4 grid gap-3">
            {recentSessions.map((session) => (
              <article
                key={`${session.bookId}-${session.updatedAt ?? "session"}`}
                className="rounded-[1.4rem] border border-stone-200 bg-[linear-gradient(180deg,#faf8f4_0%,#ffffff_100%)] px-4 py-4 text-sm text-stone-700 shadow-sm"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div
                      className={`flex h-20 w-16 shrink-0 flex-col justify-between overflow-hidden rounded-[1rem] border border-stone-200 bg-gradient-to-br ${session.coverTheme ?? getBookCoverTheme(session.bookTitle)} p-2.5 shadow-sm`}
                    >
                      <p className="text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-stone-600">
                        {session.coverLabel ?? "Listen"}
                      </p>
                      <p className="text-lg font-semibold tracking-tight text-stone-950">
                        {session.coverGlyph ?? getBookInitials(session.bookTitle)}
                      </p>
                    </div>
                    <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-stone-950">
                        {session.bookTitle} · Chapter {session.chapterIndex + 1}
                      </p>
                      {session.genreLabel ? (
                        <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-fuchsia-700">
                          {session.genreLabel}
                        </span>
                      ) : null}
                      <span className="rounded-full border border-stone-200 bg-stone-100 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-stone-600">
                        {describeSessionArtifact(session.artifactKind).badge}
                      </span>
                    </div>
                    <p className="mt-2 text-stone-500">
                      {formatPlaybackTime(session.progressSeconds)}
                      {" · "}
                      {describeSessionArtifact(session.artifactKind).detail}
                    </p>
                    </div>
                  </div>
                  <Link
                    className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:text-stone-950"
                    href={session.href}
                  >
                    {describeSessionArtifact(session.artifactKind).action}
                  </Link>
                </div>
                {session.updatedAt ? (
                  <p className="mt-2 text-stone-500">
                    {formatRelativeUpdate(session.updatedAt)}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-6 border-t border-stone-200 pt-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-stone-100 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-600">
                Render timeline
              </span>
            </div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">
                Recent render activity
              </h3>
              <p className="mt-1 text-sm text-stone-600">
                The latest sync and generation work, including failures and ready-to-play audio.
              </p>
            </div>
          <span className="rounded-full bg-stone-100 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
            {recentJobs.length}
          </span>
        </div>
        {recentJobs.length > 0 ? (
          <div className="mt-4 grid gap-3">
            {recentJobs.map((job) => (
              <article
                key={job.id}
                className="rounded-[1.4rem] border border-stone-200 bg-[linear-gradient(180deg,#f7f7f5_0%,#ffffff_100%)] px-4 py-4 text-sm text-stone-700 shadow-sm"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    {job.bookTitle ? (
                      <div
                        className={`flex h-20 w-16 shrink-0 flex-col justify-between overflow-hidden rounded-[1rem] border border-stone-200 bg-gradient-to-br ${job.coverTheme ?? getBookCoverTheme(job.bookTitle)} p-2.5 shadow-sm`}
                      >
                        <p className="text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-stone-600">
                          {job.coverLabel ??
                            (job.kind === "full-book-generation"
                              ? "Render"
                              : job.kind === "sample-generation"
                                ? "Sample"
                                : "Sync")}
                        </p>
                        <p className="text-lg font-semibold tracking-tight text-stone-950">
                          {job.coverGlyph ?? getBookInitials(job.bookTitle)}
                        </p>
                      </div>
                    ) : null}
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-stone-950">
                          {describeRecentJob(job)}
                        </p>
                        {job.genreLabel ? (
                          <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-fuchsia-700">
                            {job.genreLabel}
                          </span>
                        ) : null}
                        {job.playableArtifactKind ? (
                          <span className="rounded-full border border-stone-200 bg-stone-100 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-stone-600">
                            {job.playableArtifactKind === "full-book-generation"
                              ? "Playable full book"
                              : "Playable sample"}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-stone-500">
                        {job.bookTitle
                          ? `${job.bookTitle} · Workspace ${job.workspaceId.slice(0, 18)}…`
                          : `Workspace ${job.workspaceId.slice(0, 18)}…`}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                    {job.status}
                  </span>
                </div>
                <p className="mt-2 text-stone-600">{describeJobTarget(job)}</p>
                {job.errorMessage ? (
                  <div className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                    {job.errorMessage}
                  </div>
                ) : null}
                <p className="mt-2 text-stone-500">
                  {job.completedAt
                    ? `Completed ${new Date(job.completedAt).toLocaleString()}`
                    : `Started ${new Date(job.createdAt).toLocaleString()}`}
                </p>
                {job.resumePath ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Link
                      className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:text-stone-950"
                      href={job.resumePath}
                    >
                      {job.playableArtifactKind === "full-book-generation"
                        ? "Listen full book"
                        : job.playableArtifactKind === "sample-generation"
                          ? "Open sample"
                          : "Open book"}
                    </Link>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm text-stone-700">
            No render activity yet. Import a book or start listening to create the
            first cloud history.
          </div>
        )}
      </div>
      </div>
    </section>
  );
}
