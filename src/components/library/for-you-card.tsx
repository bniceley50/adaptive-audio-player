"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AuthorSpotlight } from "@/features/discovery/author-spotlights";
import { featuredBookCircles } from "@/features/discovery/book-circles";
import {
  discoveryChangedEvent,
  readFollowedAuthors,
  readJoinedCircles,
  readTrackedPlannedFeatures,
} from "@/features/discovery/local-discovery";
import { featuredListeningEditions } from "@/features/discovery/listening-editions";
import { workspaceContextChangedEvent } from "@/lib/library/local-state";

interface ForYouCardProps {
  spotlight: AuthorSpotlight | null;
}

export function ForYouCard({ spotlight }: ForYouCardProps) {
  const [followedAuthors, setFollowedAuthors] = useState<string[]>(() => readFollowedAuthors());
  const [joinedCircles, setJoinedCircles] = useState<string[]>(() => readJoinedCircles());
  const [trackedPlannedFeatures, setTrackedPlannedFeatures] = useState<string[]>(() =>
    readTrackedPlannedFeatures(),
  );

  useEffect(() => {
    function refresh() {
      setFollowedAuthors(readFollowedAuthors());
      setJoinedCircles(readJoinedCircles());
      setTrackedPlannedFeatures(readTrackedPlannedFeatures());
    }

    refresh();
    window.addEventListener(discoveryChangedEvent, refresh);
    window.addEventListener(workspaceContextChangedEvent, refresh);

    return () => {
      window.removeEventListener(discoveryChangedEvent, refresh);
      window.removeEventListener(workspaceContextChangedEvent, refresh);
    };
  }, []);

  const recommendation = useMemo(() => {
    const joinedCircle = featuredBookCircles.find((circle) => joinedCircles.includes(circle.id));
    if (joinedCircle) {
      return {
        eyebrow: "Because you joined a circle",
        title: joinedCircle.title,
        detail: `${joinedCircle.memberCount} listeners are following ${joinedCircle.checkpoint.toLowerCase()}.`,
        href: `/import?edition=${joinedCircle.editionId}`,
        action: "Continue with this circle",
      };
    }

    if (spotlight && followedAuthors.includes(spotlight.name)) {
      return {
        eyebrow: "Because you followed this author",
        title: `${spotlight.name} starter path`,
        detail: `Try ${spotlight.recommendedEdition} to hear the most natural first pass for this style.`,
        href: `/import?edition=${spotlight.recommendedEditionId}`,
        action: "Use the recommended edition",
      };
    }

    if (trackedPlannedFeatures.includes("private-audio-files")) {
      return {
        eyebrow: "Because you saved a future path",
        title: "Private audiobook files",
        detail:
          "You marked private audiobook files as interesting, so the app is keeping that future import path visible.",
        href: "/import?source=audio",
        action: "Review audio import plans",
      };
    }

    if (trackedPlannedFeatures.includes("richer-document-imports")) {
      return {
        eyebrow: "Because you saved a future path",
        title: "Richer document imports",
        detail:
          "You saved the richer-import path, so the app is pointing you back to the intake roadmap for what lands after plain text.",
        href: "/import",
        action: "Review the import roadmap",
      };
    }

    const edition = featuredListeningEditions[0];
    return {
      eyebrow: "Recommended for first-time listeners",
      title: edition.title,
      detail: `${edition.narratorName} in ${edition.mode} is the easiest way to hear what the app does well fast.`,
      href: `/import?edition=${edition.id}`,
      action: "Start with this edition",
    };
  }, [followedAuthors, joinedCircles, spotlight, trackedPlannedFeatures]);

  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#fffdf8_0%,#ffffff_45%,#eef4ff_100%)] shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
      <div className="p-6">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
          For you right now
        </p>
        <h2 className="mt-2 text-xl font-semibold text-stone-900">
          {recommendation.title}
        </h2>
        <p className="mt-3 text-sm font-medium text-stone-700">
          {recommendation.eyebrow}
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          {recommendation.detail}
        </p>
        <Link
          className="mt-5 inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
          href={recommendation.href}
        >
          {recommendation.action}
        </Link>
      </div>
    </section>
  );
}
