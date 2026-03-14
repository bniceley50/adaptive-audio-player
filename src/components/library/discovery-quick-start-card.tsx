import Link from "next/link";
import type { AuthorSpotlight } from "@/features/discovery/author-spotlights";
import { featuredBookCircles } from "@/features/discovery/book-circles";
import { featuredListeningEditions } from "@/features/discovery/listening-editions";

interface DiscoveryQuickStartCardProps {
  spotlight: AuthorSpotlight | null;
}

export function DiscoveryQuickStartCard({
  spotlight,
}: DiscoveryQuickStartCardProps) {
  const featuredEdition = featuredListeningEditions[0];
  const featuredCircle = featuredBookCircles[0];

  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#fffefb_0%,#ffffff_48%,#eef4ff_100%)] shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
      <div className="border-b border-stone-200/80 bg-white/85 p-6 backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              Discovery quick start
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-900">
              Pick one easy way to start
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Start from a public listening edition, join a public circle, or bring in
              your own book if you already know what you want to hear.
            </p>
          </div>
          <div className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-600 shadow-sm">
            Fast path for first-time listeners
          </div>
        </div>
      </div>
      <div className="grid gap-4 p-6 xl:grid-cols-3">
        <article className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Start with an edition
          </p>
          <h3 className="mt-3 text-lg font-semibold text-stone-950">
            {featuredEdition.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Borrow a proven sound first, then import a book with that taste already in mind.
          </p>
          <p className="mt-3 text-sm font-medium text-stone-800">
            {featuredEdition.narratorName} · <span className="capitalize">{featuredEdition.mode}</span>
          </p>
          <Link
            className="mt-4 inline-flex rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
            href={`/import?edition=${featuredEdition.id}`}
          >
            Use this edition
          </Link>
        </article>

        <article className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Join a circle
          </p>
          <h3 className="mt-3 text-lg font-semibold text-stone-950">
            {featuredCircle.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Start where other listeners already are, with one title, one checkpoint, and one recommended edition.
          </p>
          <p className="mt-3 text-sm font-medium text-stone-800">
            {featuredCircle.memberCount} listeners · {featuredCircle.bookTitle}
          </p>
          <Link
            className="mt-4 inline-flex rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
            href={`/import?edition=${featuredCircle.editionId}`}
          >
            Start with this circle
          </Link>
        </article>

        <article className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Bring your own book
          </p>
          <h3 className="mt-3 text-lg font-semibold text-stone-950">
            Import and listen your way
          </h3>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Paste text or upload a file, preview the chapters, then move straight into setup and sample generation.
          </p>
          <p className="mt-3 text-sm font-medium text-stone-800">
            {spotlight
              ? `Recommended next: try ${spotlight.recommendedEdition}`
              : "Recommended next: choose a starter edition if you want help deciding"}
          </p>
          <Link
            className="mt-4 inline-flex rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
            href="/import"
          >
            Import your own book
          </Link>
        </article>
      </div>
    </section>
  );
}
