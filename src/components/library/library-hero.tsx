import Link from "next/link";

export function LibraryHero() {
  return (
    <section className="rounded-[2rem] border border-stone-200 bg-white/80 p-8 shadow-sm">
      <p className="text-sm font-medium uppercase tracking-[0.22em] text-stone-500">
        Private listening
      </p>
      <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-stone-950">
        Choose how your audiobook sounds.
      </h2>
      <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
        Import a book, choose a narrator, and switch between Classic, Ambient,
        and Immersive listening modes.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          className="rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white"
          href="/import"
        >
          Import a book
        </Link>
        <a
          className="rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700"
          href="#featured"
        >
          Browse catalog
        </a>
      </div>
    </section>
  );
}
