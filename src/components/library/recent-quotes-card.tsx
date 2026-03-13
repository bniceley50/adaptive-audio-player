"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  readAllSavedQuotes,
  savedQuotesChangedEvent,
  type SavedQuote,
} from "@/lib/library/local-quotes";
import { formatPlaybackTime } from "@/lib/playback/local-playback";

type QuoteWithBookMeta = SavedQuote & {
  bookTitle: string | null;
  coverTheme: string | null;
  coverLabel: string | null;
  coverGlyph: string | null;
  genreLabel: string | null;
};

function readQuotesWithMeta(): QuoteWithBookMeta[] {
  return readAllSavedQuotes().slice(0, 4);
}

export function RecentQuotesCard() {
  const [quotes, setQuotes] = useState<QuoteWithBookMeta[]>(() => readQuotesWithMeta());

  useEffect(() => {
    function refreshQuotes() {
      setQuotes(readQuotesWithMeta());
    }

    window.addEventListener(savedQuotesChangedEvent, refreshQuotes);
    window.addEventListener("storage", refreshQuotes);
    return () => {
      window.removeEventListener(savedQuotesChangedEvent, refreshQuotes);
      window.removeEventListener("storage", refreshQuotes);
    };
  }, []);

  const latestQuote = quotes[0] ?? null;
  const quoteCount = quotes.length;
  const helperCopy = useMemo(() => {
    if (quoteCount === 0) {
      return "Save memorable lines while listening and they’ll show up here.";
    }

    if (quoteCount === 1) {
      return "One saved moment is ready to revisit.";
    }

    return `${quoteCount} saved moments are ready to revisit.`;
  }, [quoteCount]);

  return (
    <section className="rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#fffaf7_0%,#ffffff_52%,#fff1f2_100%)] p-6 shadow-[0_22px_70px_-46px_rgba(28,25,23,0.42)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
            Saved quotes
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-stone-950">
            Memorable lines, ready when you are
          </h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">{helperCopy}</p>
        </div>
        <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm text-stone-600 shadow-sm backdrop-blur">
          {quoteCount} saved{quoteCount === 1 ? "" : " quotes"}
        </div>
      </div>

      {latestQuote ? (
        <div className="mt-6 rounded-[1.6rem] border border-rose-200 bg-[linear-gradient(135deg,#fff1f2_0%,#ffffff_100%)] px-5 py-5 shadow-sm">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-rose-700">
            Latest favorite
          </p>
          <p className="mt-3 text-lg font-medium italic text-stone-950">
            “{latestQuote.text}”
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-stone-600">
            <span className="rounded-full border border-stone-200 bg-white px-3 py-1.5">
              {latestQuote.bookTitle ?? latestQuote.bookId}
            </span>
            <span>
              Chapter {latestQuote.chapterIndex + 1} · {formatPlaybackTime(latestQuote.progressSeconds)}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              className="rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
              href={`/player/${latestQuote.bookId}`}
            >
              Open book
            </Link>
          </div>
        </div>
      ) : null}

      {quoteCount > 1 ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {quotes.slice(1).map((quote) => (
            <div
              key={quote.id}
              className="rounded-[1.4rem] border border-stone-200 bg-white/90 px-4 py-4 shadow-sm"
            >
              <p className="line-clamp-3 text-sm italic leading-6 text-stone-700">
                “{quote.text}”
              </p>
              <p className="mt-3 text-sm font-medium text-stone-900">
                {quote.bookTitle ?? quote.bookId}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-stone-500">
                Chapter {quote.chapterIndex + 1} · {formatPlaybackTime(quote.progressSeconds)}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
