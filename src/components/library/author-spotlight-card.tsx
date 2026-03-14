"use client";

import Link from "next/link";
import { useState } from "react";
import type { AuthorSpotlight } from "@/features/discovery/author-spotlights";
import {
  readFollowedAuthors,
  toggleFollowedAuthor,
} from "@/features/discovery/local-discovery";

interface AuthorSpotlightCardProps {
  spotlight: AuthorSpotlight | null;
  title?: string;
}

export function AuthorSpotlightCard({
  spotlight,
  title = "About the author",
}: AuthorSpotlightCardProps) {
  const [followedAuthors, setFollowedAuthors] = useState<string[]>(() => readFollowedAuthors());

  if (!spotlight) {
    return null;
  }

  const isFollowing = followedAuthors.includes(spotlight.name);

  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#fffdf8_0%,#ffffff_45%,#eef4ff_100%)] p-6 shadow-[0_22px_60px_-42px_rgba(28,25,23,0.38)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
            {title}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-stone-950">
            {spotlight.name}
          </h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {spotlight.shortBio}
          </p>
        </div>
        <div className="rounded-[1.35rem] border border-white/80 bg-white/85 px-4 py-3 shadow-sm backdrop-blur">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Best edition
          </p>
          <p className="mt-2 text-base font-semibold text-stone-950">
            {spotlight.recommendedEdition}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <article className="rounded-[1.5rem] border border-stone-200 bg-white/85 p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-stone-500">
            Why listeners stay
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-700">
            {spotlight.whyListenersStay}
          </p>
        </article>
        <article className="rounded-[1.5rem] border border-stone-200 bg-white/85 p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-stone-500">
            Best for
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-700">
            {spotlight.bestFor}
          </p>
        </article>
        <article className="rounded-[1.5rem] border border-stone-200 bg-white/85 p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-stone-500">
            Signature themes
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {spotlight.signatureThemes.map((theme) => (
              <span
                key={theme}
                className="rounded-full bg-stone-100 px-3 py-1 text-[0.72rem] font-medium text-stone-700"
              >
                {theme}
              </span>
            ))}
          </div>
        </article>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          className="rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
          type="button"
          onClick={() => {
            const nextAuthors = toggleFollowedAuthor(spotlight.name);
            setFollowedAuthors(nextAuthors);
          }}
        >
          {isFollowing ? "Following author" : "Follow author"}
        </button>
        <Link
          className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
          href={`/import?edition=${spotlight.recommendedEditionId}`}
        >
          Try recommended edition
        </Link>
      </div>
    </section>
  );
}
