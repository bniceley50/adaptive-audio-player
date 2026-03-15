import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shared/app-shell";
import { getSocialCommunityPulse, listRecentSocialActivityEvents } from "@/lib/backend/sqlite";
import { getPublicEditionDetail, formatSocialCommunityEventLabel } from "@/features/social/public-social";

export default async function SocialEditionPage({
  params,
}: {
  params: Promise<{ editionId: string }>;
}) {
  const { editionId } = await params;
  const pulse = getSocialCommunityPulse();
  const events = listRecentSocialActivityEvents(12);
  const detail = getPublicEditionDetail(editionId, pulse, events);

  if (!detail) {
    notFound();
  }

  return (
    <AppShell eyebrow="Social edition" title={detail.edition.title}>
      <section className="rounded-[2rem] border border-stone-200 bg-white/80 p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
              <span className="rounded-full bg-stone-100 px-2.5 py-1">Public edition</span>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 capitalize">{detail.edition.mode}</span>
              {detail.heatBadge ? (
                <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">
                  {detail.heatBadge}
                </span>
              ) : null}
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-stone-950">
              {detail.edition.narratorName} for {detail.edition.bookTitle}
            </h2>
            <p className="mt-3 text-base leading-7 text-stone-600">{detail.edition.note}</p>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Best for {detail.edition.bestFor}. Created by {detail.edition.creator}.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800" href={`/import?edition=${detail.edition.id}`}>
              Start with this edition
            </Link>
            <Link className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50" href="/social">
              Back to social
            </Link>
          </div>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">Saves</p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">{detail.summary?.saves ?? 0}</p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">Reuses</p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">{detail.summary?.reuses ?? 0}</p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">Related circles</p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">{detail.relatedCircles.length}</p>
        </article>
      </section>
      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">Public circles using this edition</p>
          <div className="mt-4 space-y-3">
            {detail.relatedCircles.map((circle) => (
              <div key={circle.id} className="rounded-[1.2rem] border border-stone-200 bg-stone-50/80 p-4">
                <p className="text-sm font-semibold text-stone-950">{circle.title}</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">{circle.checkpoint}</p>
                <Link className="mt-3 inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50" href={`/social/circles/${circle.id}`}>
                  View circle
                </Link>
              </div>
            ))}
          </div>
        </article>
        <article className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">Recent backend activity</p>
          <div className="mt-4 space-y-3">
            {detail.recentEvents.length > 0 ? detail.recentEvents.map((event) => (
              <div key={event.id} className="rounded-[1.2rem] border border-stone-200 bg-stone-50/80 p-4">
                <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                    {formatSocialCommunityEventLabel(event.kind, event.quantity)}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1">
                    {new Date(event.occurredAt).toLocaleString()}
                  </span>
                </div>
              </div>
            )) : (
              <div className="rounded-[1.2rem] border border-stone-200 bg-stone-50/80 p-4 text-sm leading-6 text-stone-600">
                No backend activity yet for this edition.
              </div>
            )}
          </div>
        </article>
      </section>
    </AppShell>
  );
}
