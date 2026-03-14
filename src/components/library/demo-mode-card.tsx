"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  generationOutputChangedEvent,
  libraryChangedEvent,
  readLocalLibraryBook,
  upsertLocalLibraryBook,
  writeDefaultListeningProfile,
  writeLocalDraftText,
  writeLocalGenerationOutput,
  writeLocalListeningProfile,
} from "@/lib/library/local-library";
import { clearAdaptiveAudioPlayerLocalState } from "@/lib/library/local-state";
import { writePlaybackDefaults, writePersistedPlaybackState } from "@/lib/playback/local-playback";

export function DemoModeCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isApplying, setIsApplying] = useState(false);
  const [demoReady, setDemoReady] = useState(false);
  const autoOpenRequestedRef = useRef(false);

  useEffect(() => {
    function refreshDemoReady() {
      setDemoReady(
        !!readLocalLibraryBook("demo-book-1") &&
          !!readLocalLibraryBook("demo-book-2") &&
          !!readLocalLibraryBook("demo-book-3"),
      );
    }

    refreshDemoReady();
    window.addEventListener(libraryChangedEvent, refreshDemoReady);
    window.addEventListener(generationOutputChangedEvent, refreshDemoReady);
    window.addEventListener("storage", refreshDemoReady);

    return () => {
      window.removeEventListener(libraryChangedEvent, refreshDemoReady);
      window.removeEventListener(generationOutputChangedEvent, refreshDemoReady);
      window.removeEventListener("storage", refreshDemoReady);
    };
  }, []);

  const showcasePaths = useMemo(
    () => [
      {
        step: "01",
        title: "Hear the cinematic full-book version",
        body:
          "Open Harbor Lights in its current full-book render to feel the product at its most complete.",
        badge: "Full book",
        meta: "Sloane · immersive",
        href: "/player/demo-book-1?artifact=full&renderState=current",
      },
      {
        step: "02",
        title: "Compare the lighter sample path",
        body:
          "Open Midnight Platform in sample mode to show the product before the full-book render exists.",
        badge: "Sample",
        meta: "Marlowe · ambient",
        href: "/player/demo-book-2?artifact=sample&renderState=current",
      },
      {
        step: "03",
        title: "Review the taste-design workflow",
        body:
          "Open Quiet Orbit in setup to show how narrator and mode choices become the product experience.",
        badge: "Setup",
        meta: "Sloane · immersive",
        href: "/books/demo-book-3",
      },
    ],
    [],
  );

  function loadPortfolioDemo(onComplete?: () => void) {
    setIsApplying(true);
    clearAdaptiveAudioPlayerLocalState();

    const now = new Date();
    const demoBooks = [
      {
        bookId: "demo-book-1",
        title: "Harbor Lights",
        chapterCount: 3,
        updatedAt: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
        coverTheme: "from-sky-200 via-cyan-100 to-white",
        coverLabel: "Noir coast",
        coverGlyph: "HL",
        genreLabel: "Mystery",
        draftText:
          "Chapter 1\nThe harbor lights blurred in the rain.\n\nChapter 2\nMorning arrived with gulls and engine noise.\n\nChapter 3\nBy dusk, the city felt smaller.",
        narratorId: "sloane",
        narratorName: "Sloane",
        mode: "immersive",
        outputKind: "full-book-generation" as const,
        playback: {
          currentChapterIndex: 1,
          progressSeconds: 74,
          speed: 1.15,
          isBookmarked: true,
          sleepTimerMinutes: 15,
          playbackArtifactKind: "full-book-generation" as const,
          bookmarks: [
            {
              id: "demo-bookmark-1",
              chapterIndex: 1,
              progressSeconds: 74,
              createdAt: new Date(now.getTime() - 4 * 60 * 1000).toISOString(),
            },
          ],
        },
      },
      {
        bookId: "demo-book-2",
        title: "Midnight Platform",
        chapterCount: 2,
        updatedAt: new Date(now.getTime() - 12 * 60 * 1000).toISOString(),
        coverTheme: "from-violet-200 via-indigo-100 to-white",
        coverLabel: "Night transit",
        coverGlyph: "MP",
        genreLabel: "Thriller",
        draftText:
          "Chapter 1\nThe station held its breath after midnight.\n\nChapter 2\nShe boarded with five minutes to spare.",
        narratorId: "marlowe",
        narratorName: "Marlowe",
        mode: "ambient",
        outputKind: "sample-generation" as const,
        playback: {
          currentChapterIndex: 0,
          progressSeconds: 0,
          speed: 1,
          isBookmarked: false,
          sleepTimerMinutes: null,
          playbackArtifactKind: "sample-generation" as const,
          bookmarks: [],
        },
      },
      {
        bookId: "demo-book-3",
        title: "Quiet Orbit",
        chapterCount: 4,
        updatedAt: new Date(now.getTime() - 25 * 60 * 1000).toISOString(),
        coverTheme: "from-emerald-200 via-teal-100 to-white",
        coverLabel: "Orbital calm",
        coverGlyph: "QO",
        genreLabel: "Sci-fi",
        draftText:
          "Chapter 1\nThe station woke without gravity.\n\nChapter 2\nHer checklist floated beside her.\n\nChapter 3\nEarth looked unreal from this angle.\n\nChapter 4\nThe silence changed first.",
        narratorId: "sloane",
        narratorName: "Sloane",
        mode: "immersive",
        outputKind: null,
        playback: null,
      },
    ];

    writeDefaultListeningProfile({
      bookId: "default-taste",
      narratorId: "sloane",
      narratorName: "Sloane",
      mode: "immersive",
    });
    writePlaybackDefaults({
      speed: 1.15,
      sleepTimerMinutes: 15,
    });

    for (const book of demoBooks) {
      upsertLocalLibraryBook({
        bookId: book.bookId,
        title: book.title,
        chapterCount: book.chapterCount,
        updatedAt: book.updatedAt,
        coverTheme: book.coverTheme,
        coverLabel: book.coverLabel,
        coverGlyph: book.coverGlyph,
        genreLabel: book.genreLabel,
      });
      writeLocalDraftText(book.bookId, book.draftText);
      writeLocalListeningProfile({
        bookId: book.bookId,
        narratorId: book.narratorId,
        narratorName: book.narratorName,
        mode: book.mode,
      });

      if (book.outputKind) {
        writeLocalGenerationOutput({
          workspaceId: "demo-workspace",
          bookId: book.bookId,
          kind: book.outputKind,
          narratorId: book.narratorId,
          mode: book.mode,
          chapterCount: book.chapterCount,
          assetPath: `generated/demo/${book.bookId}/${book.outputKind}.wav`,
          mimeType: "audio/wav",
          provider: "mock",
          generatedAt: book.updatedAt,
        });
      }

      if (book.playback) {
        writePersistedPlaybackState(book.bookId, {
          ...book.playback,
          updatedAt: book.updatedAt,
        });
      }
    }

    setIsApplying(false);
    onComplete?.();
  }

  function resetDemo() {
    clearAdaptiveAudioPlayerLocalState();
  }

  useEffect(() => {
    const shouldAutoOpenDemo = searchParams.get("demo") === "1";

    if (!shouldAutoOpenDemo) {
      autoOpenRequestedRef.current = false;
      return;
    }

    if (isApplying || autoOpenRequestedRef.current) {
      return;
    }

    autoOpenRequestedRef.current = true;

    if (demoReady) {
      router.replace("/player/demo-book-1?artifact=full&renderState=current");
      return;
    }

    window.setTimeout(() => {
      loadPortfolioDemo(() => {
        router.replace("/player/demo-book-1?artifact=full&renderState=current");
      });
    }, 0);
  }, [demoReady, isApplying, router, searchParams]);

  return (
    <section
      id="demo-mode"
      className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#1c1917_0%,#2f2a25_38%,#0f172a_100%)] text-stone-50 shadow-[0_28px_80px_-42px_rgba(15,23,42,0.6)]"
    >
      <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-300">
            Portfolio demo
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
            Load a polished listening library instantly.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-300">
            Seed the app with three staged books, a saved default taste, playback
            defaults, generated audio artifacts, and a real in-progress session so the
            product looks alive the moment someone opens it.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:bg-stone-400"
              type="button"
              disabled={isApplying}
              onClick={() => loadPortfolioDemo()}
            >
              {isApplying ? "Loading demo..." : "Load portfolio demo"}
            </button>
            <button
              className="rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/15"
              type="button"
              onClick={resetDemo}
            >
              Reset local demo
            </button>
            {demoReady ? (
              <Link
                className="rounded-full border border-white/20 bg-amber-300 px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-200"
                href="/player/demo-book-1?artifact=full&renderState=current"
              >
                Start guided tour
              </Link>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          {[
            "Continue-listening shelf with progress",
            "Sample-ready and full-book-ready states",
            "Default taste and playback defaults already set",
          ].map((item) => (
            <div
              key={item}
              className="rounded-[1.4rem] border border-white/10 bg-white/8 px-4 py-4 text-sm leading-6 text-stone-200 shadow-sm backdrop-blur"
            >
              {item}
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-white/10 px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-300">
              Adaptive taste showcase
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              Show the same product through three different listening moments
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-300">
              This is the fastest way to demonstrate that the app is not just a file
              importer or a player. It is a system for shaping how books sound.
            </p>
          </div>
          <div className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm text-stone-200">
            {demoReady ? "Demo library loaded" : "Load the portfolio demo to unlock these paths"}
          </div>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          {showcasePaths.map((path) => (
            <article
              key={path.title}
              className="rounded-[1.5rem] border border-white/10 bg-white/8 p-5 shadow-sm backdrop-blur"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-950">
                    Step {path.step}
                  </span>
                  <span className="rounded-full bg-white/15 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white">
                    {path.badge}
                  </span>
                </div>
                <span className="text-sm text-stone-300">{path.meta}</span>
              </div>
              <h4 className="mt-4 text-lg font-semibold text-white">{path.title}</h4>
              <p className="mt-2 text-sm leading-6 text-stone-300">{path.body}</p>
              {demoReady ? (
                <Link
                  className="mt-5 inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-stone-950 transition hover:bg-stone-100"
                  href={path.href}
                >
                  Open this path
                </Link>
              ) : (
                <div className="mt-5 inline-flex rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-stone-300">
                  Load demo first
                </div>
              )}
            </article>
          ))}
        </div>
        <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-black/10 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-300">
                3-minute walkthrough
              </p>
              <h4 className="mt-2 text-lg font-semibold text-white">
                Best order for a portfolio review
              </h4>
              <p className="mt-2 text-sm leading-6 text-stone-300">
                Start with the full-book player to show the polished end state, compare it
                with the sample-only path, then finish in setup to reveal how the adaptive
                taste system creates that experience.
              </p>
            </div>
            <div className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm text-stone-200">
              {demoReady ? "Recommended tour unlocked" : "Load the demo to unlock the tour"}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {showcasePaths.map((path) =>
              demoReady ? (
                <Link
                  key={`${path.step}-tour`}
                  className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
                  href={path.href}
                >
                  Step {path.step}: {path.badge}
                </Link>
              ) : (
                <div
                  key={`${path.step}-tour`}
                  className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-stone-300"
                >
                  Step {path.step}: {path.badge}
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
