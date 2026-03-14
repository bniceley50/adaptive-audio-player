"use client";

import Link from "next/link";

const comingSoonItems = [
  {
    eyebrow: "Next",
    title: "Private audiobook files",
    detail:
      "A dedicated path for DRM-free or already-converted personal audiobook files is being shaped now.",
    meta: "Planned first support: M4B and MP3",
    href: "/import?source=audio",
    action: "View audio import plans",
  },
  {
    eyebrow: "Later",
    title: "Richer document imports",
    detail:
      "EPUB, PDF, and DOCX intake will layer onto the same simple import flow once the private-audio path lands.",
    meta: "Same setup and listening workflow",
    href: "/import",
    action: "See import roadmap",
  },
  {
    eyebrow: "Later",
    title: "Smarter library connectors",
    detail:
      "Cloud-style library connections can arrive after the private import path is clean and consumer-friendly.",
    meta: "Library-first, not setup-heavy",
    href: "/import?source=audio",
    action: "See what’s coming",
  },
] as const;

export function ComingNextCard() {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#fcfbf7_0%,#ffffff_42%,#eef4ff_100%)] shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
      <div className="border-b border-stone-200/80 bg-white/85 p-6 backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              Coming next
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-900">
              See where the product is heading without losing the simple path today
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              The app keeps the everyday listening flow simple now, while making the next
              private-library steps visible and easy to understand.
            </p>
          </div>
          <div className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-600 shadow-sm">
            Planned features stay product-shaped
          </div>
        </div>
      </div>
      <div className="grid gap-4 p-6 xl:grid-cols-3">
        {comingSoonItems.map((item) => (
          <article
            key={item.title}
            className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm"
          >
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
              {item.eyebrow}
            </p>
            <h3 className="mt-3 text-lg font-semibold text-stone-950">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">{item.detail}</p>
            <p className="mt-3 text-sm font-medium text-stone-800">{item.meta}</p>
            <Link
              className="mt-4 inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
              href={item.href}
            >
              {item.action}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
