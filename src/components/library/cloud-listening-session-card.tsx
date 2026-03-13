"use client";

import Link from "next/link";
import {
  describeSessionArtifact,
  formatPlaybackTime,
  formatRelativeUpdate,
} from "@/components/library/cloud-activity-shared";
import { getBookCoverTheme, getBookInitials } from "@/features/reader/shared-support";

type CloudListeningSession = {
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
};

export function CloudListeningSessionCard({
  session,
  variant,
}: {
  session: CloudListeningSession;
  variant: "hero" | "list";
}) {
  const sessionArtifact = describeSessionArtifact(session.artifactKind);

  if (variant === "hero") {
    return (
      <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#f6fffb_100%)] p-5 text-sm text-emerald-950 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className={`flex h-24 w-20 shrink-0 flex-col justify-between overflow-hidden rounded-[1.2rem] border border-emerald-200 bg-gradient-to-br ${session.coverTheme ?? getBookCoverTheme(session.bookTitle)} p-3 shadow-sm`}
            >
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-stone-600">
                {session.coverLabel ?? "Session"}
              </p>
              <p className="text-xl font-semibold tracking-tight text-stone-950">
                {session.coverGlyph ?? getBookInitials(session.bookTitle)}
              </p>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-emerald-200 bg-white/75 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-emerald-700">
                  Continue anywhere
                </span>
                {session.genreLabel ? (
                  <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-fuchsia-700">
                    {session.genreLabel}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-emerald-700">
                Latest cloud listening
              </p>
              <p className="mt-3 text-base font-medium">
                {session.bookTitle} · Chapter {session.chapterIndex + 1} ·{" "}
                {formatPlaybackTime(session.progressSeconds)}
              </p>
              <p className="mt-2 text-emerald-800">
                {sessionArtifact.detail}
                {session.updatedAt
                  ? ` · ${formatRelativeUpdate(session.updatedAt)}`
                  : ""}
              </p>
            </div>
          </div>
          <Link
            className="rounded-full border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-900 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-100"
            href={session.href}
          >
            {sessionArtifact.action}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <article className="rounded-[1.4rem] border border-stone-200 bg-[linear-gradient(180deg,#faf8f4_0%,#ffffff_100%)] px-4 py-4 text-sm text-stone-700 shadow-sm">
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
                {sessionArtifact.badge}
              </span>
            </div>
            <p className="mt-2 text-stone-500">
              {formatPlaybackTime(session.progressSeconds)}
              {" · "}
              {sessionArtifact.detail}
            </p>
          </div>
        </div>
        <Link
          className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:text-stone-950"
          href={session.href}
        >
          {sessionArtifact.action}
        </Link>
      </div>
      {session.updatedAt ? (
        <p className="mt-2 text-stone-500">{formatRelativeUpdate(session.updatedAt)}</p>
      ) : null}
    </article>
  );
}
