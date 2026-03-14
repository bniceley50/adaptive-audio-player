"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AuthorSpotlight } from "@/features/discovery/author-spotlights";
import { featuredAuthorSpotlights } from "@/features/discovery/author-spotlights";
import { featuredBookCircles } from "@/features/discovery/book-circles";
import { featuredListeningEditions } from "@/features/discovery/listening-editions";
import { useDiscoveryPreferences } from "@/features/discovery/use-discovery-preferences";
import { libraryChangedEvent, readLocalLibraryBooks } from "@/lib/library/local-library";
import { workspaceContextChangedEvent } from "@/lib/library/local-state";

interface DiscoveryQuickStartCardProps {
  spotlight: AuthorSpotlight | null;
}

export function DiscoveryQuickStartCard({
  spotlight,
}: DiscoveryQuickStartCardProps) {
  const [localBookCount, setLocalBookCount] = useState<number>(() =>
    typeof window === "undefined" ? 0 : readLocalLibraryBooks().length,
  );
  const {
    followedAuthors,
    joinedCircles,
    personalizationPaused,
    pinnedDiscoverySignal,
    trackedPlannedFeatures,
  } = useDiscoveryPreferences();
  const effectiveFollowedAuthors = useMemo(
    () => (personalizationPaused ? [] : followedAuthors),
    [followedAuthors, personalizationPaused],
  );
  const effectiveJoinedCircles = useMemo(
    () => (personalizationPaused ? [] : joinedCircles),
    [joinedCircles, personalizationPaused],
  );
  const effectivePinnedSignal = useMemo(
    () => (personalizationPaused ? null : pinnedDiscoverySignal),
    [personalizationPaused, pinnedDiscoverySignal],
  );
  const effectiveTrackedFeatures = useMemo(
    () => (personalizationPaused ? [] : trackedPlannedFeatures),
    [personalizationPaused, trackedPlannedFeatures],
  );
  const featuredEdition = featuredListeningEditions[0];
  const featuredCircle = featuredBookCircles[0];

  useEffect(() => {
    function refreshLibraryCount() {
      setLocalBookCount(readLocalLibraryBooks().length);
    }

    refreshLibraryCount();
    window.addEventListener(libraryChangedEvent, refreshLibraryCount);
    window.addEventListener(workspaceContextChangedEvent, refreshLibraryCount);

    return () => {
      window.removeEventListener(libraryChangedEvent, refreshLibraryCount);
      window.removeEventListener(workspaceContextChangedEvent, refreshLibraryCount);
    };
  }, []);

  const cards = useMemo(() => {
    const joinedCircle = featuredBookCircles.find((circle) =>
      effectiveJoinedCircles.includes(circle.id),
    );
    const pinnedCard =
      effectivePinnedSignal?.kind === "circle"
        ? (() => {
            const circle = featuredBookCircles.find((item) => item.id === effectivePinnedSignal.id);
            if (!circle) {
              return null;
            }

            return {
              eyebrow: "Pinned for you",
              title: circle.title,
              detail:
                "You pinned this circle, so it stays near the top as the easiest social path back into the app.",
              meta: `${circle.memberCount} listeners · ${circle.checkpoint}`,
              href: `/import?edition=${circle.editionId}`,
              action: "Open your pinned circle",
            };
          })()
        : effectivePinnedSignal?.kind === "author"
          ? (() => {
              const author = featuredAuthorSpotlights.find(
                (item) => item.name === effectivePinnedSignal.id,
              );
              if (!author) {
                return null;
              }

              return {
                eyebrow: "Pinned for you",
                title: `${author.name} starter path`,
                detail:
                  "You pinned this author path, so the recommended edition stays one tap away.",
                meta: `Recommended edition: ${author.recommendedEdition}`,
                href: `/import?edition=${author.recommendedEditionId}`,
                action: "Use your pinned author path",
              };
            })()
          : effectivePinnedSignal?.kind === "feature"
            ? {
                eyebrow: "Pinned for you",
                title:
                  effectivePinnedSignal.id === "private-audio-files"
                    ? "Your audiobook-file plan"
                    : "Your future import plan",
                detail:
                  "You pinned this future path, so the roadmap stays visible even when discovery suggestions change.",
                meta:
                  effectivePinnedSignal.id === "private-audio-files"
                    ? "Planned first support: M4B and MP3"
                    : "Planned later: EPUB, PDF, and DOCX",
                href:
                  effectivePinnedSignal.id === "private-audio-files"
                    ? "/import?source=audio"
                    : "/import",
                action: "Open your pinned path",
              }
            : null;
    const followedAuthorCard =
      spotlight &&
      effectiveFollowedAuthors.includes(spotlight.name) &&
      !(effectivePinnedSignal?.kind === "author" && effectivePinnedSignal.id === spotlight.name)
        ? {
            eyebrow: "Followed author",
            title: `${spotlight.name} starter path`,
            detail:
              "You already followed this author, so the app is keeping the recommended first edition closer to the top.",
            meta: `Best next listen: ${spotlight.recommendedEdition}`,
            href: `/import?edition=${spotlight.recommendedEditionId}`,
            action: "Use the recommended edition",
          }
        : null;
    const personalizedFutureCard =
      effectiveTrackedFeatures.includes("private-audio-files") &&
      !(
        effectivePinnedSignal?.kind === "feature" &&
        effectivePinnedSignal.id === "private-audio-files"
      )
        ? {
            eyebrow: "Saved future path",
            title: "Your audiobook-file plan",
            detail:
              "You already saved the private-audio path, so the app keeps that roadmap visible while the simple text flow stays live today.",
            meta: "Planned first support: M4B and MP3",
            href: "/import?source=audio",
            action: "Review audio plans",
          }
        : effectiveTrackedFeatures.includes("richer-document-imports") &&
            !(
              effectivePinnedSignal?.kind === "feature" &&
              effectivePinnedSignal.id === "richer-document-imports"
            )
          ? {
              eyebrow: "Saved future path",
              title: "Your richer import plan",
              detail:
                "You marked richer document imports as interesting, so the intake roadmap stays easy to find while text remains the fastest path.",
              meta: "Planned later: EPUB, PDF, and DOCX",
              href: "/import",
              action: "Review the roadmap",
            }
        : null;

    if (localBookCount === 0) {
      return [
        {
          eyebrow: "Load the demo",
          title: "See the product alive instantly",
          detail:
            "Start with the polished demo if you want playback, saved taste, generated audio, and a real shelf immediately.",
          meta: "Three staged books · guided tour ready",
          href: "/?demo=1",
          action: "Open the demo",
        },
        ...(pinnedCard ? [pinnedCard] : []),
        {
          eyebrow: "Start with an edition",
          title: featuredEdition.title,
          detail:
            "Borrow a proven sound first, then import a book with that taste already in mind.",
          meta: `${featuredEdition.narratorName} · ${featuredEdition.mode}`,
          href: `/import?edition=${featuredEdition.id}`,
          action: "Use this edition",
        },
        ...(joinedCircle &&
        !(
          effectivePinnedSignal?.kind === "circle" &&
          effectivePinnedSignal.id === joinedCircle.id
        )
          ? [
              {
                eyebrow: "Joined circle",
                title: joinedCircle.title,
                detail:
                  "You already joined this public circle, so the app keeps its recommended edition close for the fastest way back in.",
                meta: `${joinedCircle.memberCount} listeners · ${joinedCircle.bookTitle}`,
                href: `/import?edition=${joinedCircle.editionId}`,
                action: "Start with your circle",
              },
            ]
          : []),
        ...(followedAuthorCard ? [followedAuthorCard] : []),
        ...(personalizedFutureCard ? [personalizedFutureCard] : []),
        {
          eyebrow: "Bring your own book",
          title: "Import and listen your way",
          detail:
            "Paste text or upload a file, preview the chapters, and move straight into setup and sample generation.",
          meta: spotlight
            ? `Recommended next: try ${spotlight.recommendedEdition}`
            : "Recommended next: choose a starter edition if you want help deciding",
          href: "/import?source=paste",
          action: "Import your own book",
        },
        ...(personalizedFutureCard
          ? []
          : [
              {
                eyebrow: "Private audio next",
                title: "Bring your audiobook files later",
                detail:
                  "The future private-audio path is being shaped for DRM-free or already-converted personal audiobook files.",
                meta: "Planned first support: M4B and MP3",
                href: "/import?source=audio",
                action: "See audio import plans",
              },
            ]),
      ];
    }

    return [
      ...(pinnedCard ? [pinnedCard] : []),
      {
        eyebrow: "Start with an edition",
        title: featuredEdition.title,
        detail:
          "Borrow a proven sound first, then import a book with that taste already in mind.",
        meta: `${featuredEdition.narratorName} · ${featuredEdition.mode}`,
        href: `/import?edition=${featuredEdition.id}`,
        action: "Use this edition",
      },
      {
        eyebrow: "Join a circle",
        title: featuredCircle.title,
        detail:
          "Start where other listeners already are, with one title, one checkpoint, and one recommended edition.",
        meta: `${featuredCircle.memberCount} listeners · ${featuredCircle.bookTitle}`,
        href: `/import?edition=${featuredCircle.editionId}`,
        action: "Start with this circle",
      },
      ...(joinedCircle &&
      !(
        effectivePinnedSignal?.kind === "circle" &&
        effectivePinnedSignal.id === joinedCircle.id
      )
        ? [
            {
              eyebrow: "Return to your circle",
              title: joinedCircle.title,
              detail:
                "You already joined this public circle, so the app is keeping the shared title and edition in reach.",
              meta: `${joinedCircle.memberCount} listeners · ${joinedCircle.checkpoint}`,
              href: `/import?edition=${joinedCircle.editionId}`,
              action: "Continue with your circle",
            },
          ]
        : []),
      ...(followedAuthorCard ? [followedAuthorCard] : []),
      ...(personalizedFutureCard ? [personalizedFutureCard] : []),
      {
        eyebrow: "Bring your own book",
        title: "Import and listen your way",
        detail:
          "Paste text or upload a file, preview the chapters, then move straight into setup and sample generation.",
        meta: spotlight
          ? `Recommended next: try ${spotlight.recommendedEdition}`
          : "Recommended next: choose a starter edition if you want help deciding",
        href: "/import?source=paste",
        action: "Import your own book",
      },
      ...(personalizedFutureCard
        ? []
        : [
            {
              eyebrow: "Private audio next",
              title: "Plan for personal audiobook files",
              detail:
                "If your library already includes DRM-free or converted audiobook files, the future path is being shaped for that workflow too.",
              meta: "Planned first support: M4B and MP3",
              href: "/import?source=audio",
              action: "See audio import plans",
            },
          ]),
    ];
  }, [
    featuredCircle,
    featuredEdition,
    effectiveFollowedAuthors,
    effectiveJoinedCircles,
    effectivePinnedSignal,
    effectiveTrackedFeatures,
    localBookCount,
    spotlight,
  ]);

  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#fffefb_0%,#ffffff_48%,#eef4ff_100%)] shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
      <div className="border-b border-stone-200/80 bg-white/85 p-6 backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              Discovery quick start
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-900">
              {localBookCount === 0 ? "Pick the easiest first step" : "Pick one easy way to continue"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              {localBookCount === 0
                ? "Start from the polished demo, a featured listening edition, or your own book. The goal is to hear the product fast, not configure everything first."
                : "Start from a public listening edition, a public circle, or bring in another book if you already know what you want to hear."}
            </p>
          </div>
          <div className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-600 shadow-sm">
            {localBookCount === 0 ? "Fast path for first-time listeners" : "Fast path back into discovery"}
          </div>
        </div>
      </div>
      <div className="grid gap-4 p-6 xl:grid-cols-4">
        {cards.map((card) => (
          <article
            key={card.title}
            className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm"
          >
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
              {card.eyebrow}
            </p>
            <h3 className="mt-3 text-lg font-semibold text-stone-950">
              {card.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">{card.detail}</p>
            <p className="mt-3 text-sm font-medium text-stone-800">{card.meta}</p>
            <Link
              className="mt-4 inline-flex rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
              href={card.href}
            >
              {card.action}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
