"use client";

import Link from "next/link";
import { getBookCoverTheme, getBookInitials } from "@/features/reader/shared-support";
import type { SyncJobSummary } from "@/lib/backend/types";

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

type DecoratedSyncJobSummary = SyncJobSummary & {
  coverTheme: string | null;
  coverLabel: string | null;
  coverGlyph: string | null;
  genreLabel: string | null;
};

export function CloudJobActivityCard({
  job,
}: {
  job: DecoratedSyncJobSummary;
}) {
  return (
    <article className="rounded-[1.4rem] border border-stone-200 bg-[linear-gradient(180deg,#f7f7f5_0%,#ffffff_100%)] px-4 py-4 text-sm text-stone-700 shadow-sm">
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
              <p className="font-medium text-stone-950">{describeRecentJob(job)}</p>
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
  );
}
