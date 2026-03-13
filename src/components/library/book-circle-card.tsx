"use client";

import { useMemo, useState } from "react";
import { readSavedQuotes, type SavedQuote } from "@/lib/library/local-quotes";

export function BookCircleCard({
  bookId,
  bookTitle,
  coverGlyph,
  coverLabel,
  coverTheme,
  genreLabel,
  href,
  mode,
  narratorName,
}: {
  bookId: string;
  bookTitle: string;
  coverGlyph?: string | null;
  coverLabel?: string | null;
  coverTheme?: string | null;
  genreLabel?: string | null;
  href: string;
  mode?: string | null;
  narratorName?: string | null;
}) {
  const [savedQuotes] = useState<SavedQuote[]>(() => readSavedQuotes(bookId));
  const [shareFeedback, setShareFeedback] = useState<"idle" | "shared" | "copied">(
    "idle",
  );
  const latestQuote = useMemo(() => savedQuotes[0] ?? null, [savedQuotes]);

  const accentClass =
    coverTheme === "storm"
      ? "from-slate-950 via-slate-800 to-sky-700 text-white"
      : coverTheme === "focus"
        ? "from-stone-950 via-amber-800 to-orange-500 text-white"
        : coverTheme === "night"
          ? "from-indigo-950 via-violet-800 to-fuchsia-500 text-white"
          : "from-stone-900 via-stone-800 to-stone-600 text-white";

  async function shareBookCircle() {
    const tasteLine =
      narratorName && mode
        ? `Start with ${narratorName} in ${mode} mode.`
        : "Start with the current listening edition.";
    const momentLine = latestQuote
      ? `A saved moment to start from: “${latestQuote.text}”`
      : "Bring your reactions, quotes, and favorite scenes.";
    const shareText = `Join my book circle for ${bookTitle}. ${tasteLine} ${momentLine}`;
    const shareUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}${href}`
        : `https://github.com/bniceley50/adaptive-audio-player`;

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `${bookTitle} · Book circle`,
          text: shareText,
          url: shareUrl,
        });
        setShareFeedback("shared");
        return;
      } catch {
        // fall through to clipboard when native share is cancelled/unavailable
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setShareFeedback("copied");
    }
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#eef4ff_0%,#fffefb_46%,#ffffff_100%)] shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
      <div className="border-b border-stone-200/80 bg-white/85 p-6 backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              Book circle
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-900">
              Start a shared listening thread
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Invite friends into a serious listening edition so everyone starts the
              same title with the same narrator and mood.
            </p>
          </div>
          <button
            className="rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800"
            type="button"
            onClick={() => {
              void shareBookCircle();
            }}
          >
            {typeof navigator !== "undefined" && typeof navigator.share === "function"
              ? "Share book circle"
              : "Copy circle invite"}
          </button>
        </div>
      </div>
      <div className="grid gap-5 p-6 md:grid-cols-[0.9fr_1.1fr]">
        <div
          className={`rounded-[1.6rem] bg-gradient-to-br ${accentClass} p-5 shadow-sm`}
        >
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-white/70">
            Featured title
          </p>
          <div className="mt-5 flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-[1.2rem] border border-white/15 bg-white/10 text-2xl shadow-inner">
              {coverGlyph ?? "♪"}
            </div>
            <div className="min-w-0">
              <p className="text-sm uppercase tracking-[0.18em] text-white/70">
                {coverLabel ?? "Adaptive edition"}
              </p>
              <h3 className="mt-2 text-2xl font-semibold leading-tight text-white">
                {bookTitle}
              </h3>
              {genreLabel ? (
                <p className="mt-2 text-sm text-white/80">{genreLabel}</p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
              Circle edition
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-700">
              {narratorName ? (
                <span className="rounded-full border border-stone-200 bg-stone-100 px-3 py-1.5">
                  {narratorName}
                </span>
              ) : null}
              {mode ? (
                <span className="rounded-full border border-stone-200 bg-stone-100 px-3 py-1.5 capitalize">
                  {mode}
                </span>
              ) : null}
              <span className="rounded-full border border-stone-200 bg-stone-100 px-3 py-1.5">
                Invite by link
              </span>
              {latestQuote ? (
                <span className="rounded-full border border-stone-200 bg-stone-100 px-3 py-1.5">
                  Quote ready
                </span>
              ) : null}
            </div>
            <p className="mt-4 text-sm leading-6 text-stone-600">
              Start with one trusted edition, then let friends react, compare moments,
              and keep the conversation around the same listening experience.
            </p>
            {latestQuote ? (
              <div className="mt-4 rounded-[1.2rem] border border-stone-200 bg-stone-50/80 p-4">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
                  Circle opener
                </p>
                <p className="mt-2 text-sm italic leading-6 text-stone-800">
                  “{latestQuote.text}”
                </p>
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              "Share the current edition",
              "Invite friends into the same title",
              "Use the player to swap notes and moments",
            ].map((step, index) => (
              <article
                key={step}
                className="rounded-[1.4rem] border border-stone-200 bg-white/85 p-4 shadow-sm"
              >
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
                  Step 0{index + 1}
                </p>
                <p className="mt-3 text-sm leading-6 text-stone-700">{step}</p>
              </article>
            ))}
          </div>
          <div className="space-y-1 text-sm text-stone-600">
            <p>
              <a className="font-semibold text-stone-900 underline-offset-4 hover:underline" href={href}>
                Open the listening screen
              </a>{" "}
              to share this circle from the player with quotes, bookmarks, and the live
              edition.
            </p>
            {shareFeedback !== "idle" ? (
              <p className="font-medium text-stone-900">
                {shareFeedback === "shared"
                  ? "Book circle invite shared."
                  : "Book circle invite copied to clipboard."}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
