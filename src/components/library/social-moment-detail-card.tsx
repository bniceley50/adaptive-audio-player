"use client";

import Link from "next/link";
import { useState } from "react";
import type { FeaturedBookCircle } from "@/features/discovery/book-circles";
import type { FeaturedListeningEdition } from "@/features/discovery/listening-editions";
import type { PublicSocialMoment } from "@/features/social/public-moments";
import type {
  SocialCommunityCircleSummary,
  SocialCommunityEditionSummary,
  SocialCommunityMomentSummary,
} from "@/lib/backend/types";

export function SocialMomentDetailCard({
  moment,
  edition,
  circle,
  activity,
  relatedMoments,
}: {
  moment: PublicSocialMoment;
  edition: FeaturedListeningEdition | null;
  circle: FeaturedBookCircle | null;
  activity: {
    momentSummary: SocialCommunityMomentSummary | null;
    editionSummary: SocialCommunityEditionSummary | null;
    circleSummary: SocialCommunityCircleSummary | null;
    heatBadge: string | null;
    score: number;
  };
  relatedMoments: {
    moment: PublicSocialMoment;
    activity: {
      momentSummary: SocialCommunityMomentSummary | null;
      editionSummary: SocialCommunityEditionSummary | null;
      circleSummary: SocialCommunityCircleSummary | null;
      heatBadge: string | null;
      score: number;
    };
  }[];
}) {
  const [copied, setCopied] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);

  async function copyMoment() {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(`“${moment.quote}”\n\n${moment.bookTitle} · ${moment.chapterLabel}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function reportMoment() {
    setReporting(true);
    setReportFeedback(null);

    try {
      const response = await fetch("/api/social/report", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contentKind: "moment",
          contentId: moment.id,
          reason: "needs-review",
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; reportCount?: number }
        | null;

      if (!response.ok) {
        setReportFeedback(payload?.error ?? "Could not send this report.");
      } else {
        setReportFeedback(
          `Reported for review${payload?.reportCount ? ` · ${payload.reportCount} report${payload.reportCount === 1 ? "" : "s"}` : ""}.`,
        );
      }
    } catch {
      setReportFeedback("Could not send this report.");
    } finally {
      setReporting(false);
      window.setTimeout(() => setReportFeedback(null), 2400);
    }
  }

  return (
    <>
      <section className="rounded-[2rem] border border-stone-200 bg-white/80 p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
              <span className="rounded-full bg-stone-100 px-2.5 py-1">Public moment</span>
              <span className="rounded-full bg-stone-100 px-2.5 py-1">{moment.moodLabel}</span>
              {activity.heatBadge ? (
                <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">
                  {activity.heatBadge}
                </span>
              ) : null}
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-stone-950">
              {moment.bookTitle}
            </h2>
            <p className="mt-4 text-xl font-medium italic leading-8 text-stone-950">
              “{moment.quote}”
            </p>
            <p className="mt-4 text-base leading-7 text-stone-600">{moment.curatorNote}</p>
            {moment.ownerLabel ? (
              <p className="mt-3 text-sm leading-6 text-stone-600">
                Shared by {moment.ownerLabel}.
              </p>
            ) : null}
            {reportFeedback ? (
              <p className="mt-3 text-sm font-medium text-emerald-700">{reportFeedback}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            {circle ? (
              <Link
                className="rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
                href={`/social/circles/${circle.id}?moment=${moment.id}&entry=moment-path#moment-led`}
              >
                Start with this circle path
              </Link>
            ) : edition ? (
              <Link
                className="rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
                href={`/social/editions/${edition.id}?moment=${moment.id}&entry=moment-path#moment-led`}
              >
                Start with this edition path
              </Link>
            ) : null}
            <Link
              className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
              href={`/social/circles/start?moment=${moment.id}`}
            >
              Start a fresh circle
            </Link>
            <button
              className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
              onClick={() => {
                void copyMoment();
              }}
              type="button"
            >
              {copied ? "Copied" : "Copy moment"}
            </button>
            <button
              className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={reporting}
              onClick={() => {
                void reportMoment();
              }}
              type="button"
            >
              {reporting ? "Reporting..." : "Report moment"}
            </button>
            <Link
              className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
              href="/social"
            >
              Back to social
            </Link>
          </div>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Chapter
          </p>
          <p className="mt-3 text-lg font-semibold text-stone-950">{moment.chapterLabel}</p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Promotions
          </p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">
            {activity.momentSummary?.promotions ?? 0}
          </p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Edition saves
          </p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">
            {activity.editionSummary?.saves ?? 0}
          </p>
        </article>
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
            Moment-led path
          </p>
          <div className="mt-4 space-y-4">
            {edition ? (
              <div className="rounded-[1.2rem] border border-stone-200 bg-stone-50/80 p-4">
                <p className="text-sm font-semibold text-stone-950">{edition.title}</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {edition.narratorName} in {edition.mode} mode for {edition.bookTitle}
                </p>
                <Link
                  className="mt-3 inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                  href={`/social/editions/${edition.id}?moment=${moment.id}&entry=moment-path#moment-led`}
                >
                  Open edition from this moment
                </Link>
              </div>
            ) : null}
            {circle ? (
              <div className="rounded-[1.2rem] border border-stone-200 bg-stone-50/80 p-4">
                <p className="text-sm font-semibold text-stone-950">{circle.title}</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">{circle.checkpoint}</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  This is the most direct shared path if you want this moment to turn into a live checkpoint instead of a one-off quote.
                </p>
                <Link
                  className="mt-3 inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                  href={`/social/circles/${circle.id}?moment=${moment.id}&entry=moment-path#moment-led`}
                >
                  Open circle from this moment
                </Link>
              </div>
            ) : null}
          </div>
        </article>
        <article className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
            Related moments
          </p>
          <div className="mt-4 space-y-3">
            {relatedMoments.map((entry) => (
              <div
                key={entry.moment.id}
                className="rounded-[1.2rem] border border-stone-200 bg-stone-50/80 p-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  <span className="rounded-full bg-stone-100 px-2.5 py-1">
                    {entry.moment.moodLabel}
                  </span>
                  {entry.activity.heatBadge ? (
                    <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">
                      {entry.activity.heatBadge}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 line-clamp-3 text-sm italic leading-6 text-stone-700">
                  “{entry.moment.quote}”
                </p>
                <Link
                  className="mt-3 inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                  href={`/social/moments/${entry.moment.id}`}
                >
                  View moment
                </Link>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}
