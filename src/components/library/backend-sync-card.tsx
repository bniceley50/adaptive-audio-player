import type {
  SyncJobSummary,
  WorkerHeartbeatSummary,
  WorkspaceSyncSummary,
} from "@/lib/backend/types";
import Link from "next/link";
import { CloudJobActivityCard } from "@/components/library/cloud-job-activity-card";
import { CloudListeningSessionCard } from "@/components/library/cloud-listening-session-card";
import { CloudWorkerStatusCard } from "@/components/library/cloud-worker-status-card";
import { ManualSyncButton } from "@/components/library/manual-sync-button";

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

      <CloudWorkerStatusCard
        renderedAt={renderedAt}
        workerHeartbeat={workerHeartbeat}
      />

      {latestSession ? (
        <CloudListeningSessionCard session={latestSession} variant="hero" />
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
              <CloudListeningSessionCard
                key={`${session.bookId}-${session.updatedAt ?? "session"}`}
                session={session}
                variant="list"
              />
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
              <CloudJobActivityCard key={job.id} job={job} />
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
