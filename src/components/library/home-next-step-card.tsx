"use client";

import Link from "next/link";
import { useMemo } from "react";
import { featuredAuthorSpotlights } from "@/features/discovery/author-spotlights";
import { featuredBookCircles } from "@/features/discovery/book-circles";
import { getTrendingMoments } from "@/features/discovery/community-trending";
import {
  getHomeDiscoveryReason,
  getPinnedDiscoveryReason,
} from "@/features/discovery/personalization";
import { useDiscoveryPreferences } from "@/features/discovery/use-discovery-preferences";
import type { SocialCommunityPulseSummary } from "@/lib/backend/types";
import type { SyncedSocialState } from "@/lib/types/social";

interface HomeNextStepCardProps {
  hasSyncedBook: boolean;
  latestBookTitle: string | null;
  latestBookHref: string | null;
  isSignedIn: boolean;
  listeningStreakDays: number;
  recommendedEdition: string | null;
  spotlightName: string | null;
  pulse?: SocialCommunityPulseSummary | null;
  socialState?: SyncedSocialState | null;
}

export function HomeNextStepCard({
  hasSyncedBook,
  latestBookTitle,
  latestBookHref,
  isSignedIn,
  listeningStreakDays,
  recommendedEdition,
  spotlightName,
  pulse = null,
  socialState = null,
}: HomeNextStepCardProps) {
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
  const joinedCircle = featuredBookCircles.find((circle) =>
    effectiveJoinedCircles.includes(circle.id),
  );
  const pinnedReason = useMemo(
    () => getPinnedDiscoveryReason(effectivePinnedSignal),
    [effectivePinnedSignal],
  );
  const homeReason = useMemo(
    () =>
      getHomeDiscoveryReason(
        {
          hasSyncedBook,
          latestBookTitle,
          spotlightName,
        },
        {
          followedAuthors: effectiveFollowedAuthors,
          joinedCircles: effectiveJoinedCircles,
          trackedPlannedFeatures: effectiveTrackedFeatures,
        },
      ),
    [
      effectiveFollowedAuthors,
      effectiveJoinedCircles,
      effectiveTrackedFeatures,
      hasSyncedBook,
      latestBookTitle,
      spotlightName,
    ],
  );

  const primaryAction = useMemo(() => {
    if (hasSyncedBook && latestBookHref) {
      return {
        title: "Resume your best current title",
        body: latestBookTitle
          ? `Jump back into ${latestBookTitle} and keep the listening loop moving.`
          : "Jump back into your latest synced title and keep the listening loop moving.",
        href: latestBookHref,
        label: "Resume listening",
      };
    }

    if (effectivePinnedSignal?.kind === "circle") {
      const pinnedCircle = featuredBookCircles.find(
        (circle) => circle.id === effectivePinnedSignal.id,
      );
      if (pinnedCircle) {
        return {
          title: "Return to your pinned circle",
          body: `You pinned ${pinnedCircle.title}, so it stays ahead of the normal discovery order.`,
          href: `/import?edition=${pinnedCircle.editionId}`,
          label: "Continue with your pinned circle",
        };
      }
    }

    if (effectivePinnedSignal?.kind === "author") {
      const pinnedAuthor = featuredAuthorSpotlights.find(
        (author) => author.name === effectivePinnedSignal.id,
      );
      if (pinnedAuthor) {
        return {
          title: "Start from your pinned author",
          body: `You pinned ${pinnedAuthor.name}, so the recommended edition stays ready for the next import.`,
          href: `/import?edition=${pinnedAuthor.recommendedEditionId}`,
          label: "Use the pinned edition",
        };
      }
    }

    if (effectivePinnedSignal?.kind === "feature") {
      return {
        title: "Keep your pinned future path visible",
        body:
          "You pinned a future import path, so it stays ahead of the usual discovery suggestions.",
        href:
          effectivePinnedSignal.id === "private-audio-files"
            ? "/import?source=audio"
            : "/import",
        label: "Open the pinned path",
      };
    }

    if (joinedCircle) {
      return {
        title: "Return to your public circle",
        body: `Jump back into ${joinedCircle.title} and use the shared edition path that other listeners are already following.`,
        href: `/import?edition=${joinedCircle.editionId}`,
        label: "Continue with your circle",
      };
    }

    if (effectiveFollowedAuthors.length > 0 && recommendedEdition) {
      return {
        title: "Start from an author you followed",
        body: `Use ${recommendedEdition} as the fastest way into a style you already told the app you want more of.`,
        href: "/import?edition=cinematic-harbor",
        label: "Try the recommended edition",
      };
    }

    if (effectiveTrackedFeatures.includes("private-audio-files")) {
      return {
        title: "Plan for your audiobook files",
        body:
          "You saved the private-audio path, so the app is keeping that future import route easy to find while the simple text flow stays live today.",
        href: "/import?source=audio",
        label: "View audio import plans",
      };
    }

    const trendingMoment = getTrendingMoments(pulse, socialState, 1)[0] ?? null;
    if (trendingMoment) {
      return {
        title: "Start from the moment people are sharing",
        body: `“${trendingMoment.moment.quote}” is getting promoted right now, so this is the fastest path into live social momentum instead of a cold start.`,
        href: `/social?moment=${trendingMoment.moment.id}&entry=trending-moment#moment-${trendingMoment.moment.id}`,
        label: "Open the trending moment",
      };
    }

    return {
      title: "Import your first book",
      body:
        "Paste text or upload a file, preview the chapters, and move straight into setup.",
      href: "/import?source=paste",
        label: "Start importing",
      };
  }, [
    effectiveFollowedAuthors.length,
    effectivePinnedSignal,
    effectiveTrackedFeatures,
    hasSyncedBook,
    joinedCircle,
    latestBookHref,
    latestBookTitle,
    pulse,
    recommendedEdition,
    socialState,
  ]);

  const secondaryActions = [
    {
      title: joinedCircle ? "Keep your circle moving" : "Start from discovery",
      body: joinedCircle
        ? `You already joined ${joinedCircle.title}, so the shared edition and checkpoint are the easiest way back into social listening.`
        : recommendedEdition
          ? `Use ${recommendedEdition} if you want the app to make the first sound decision for you.`
          : "Use a featured listening edition if you want the app to make the first sound decision for you.",
      href: joinedCircle ? `/import?edition=${joinedCircle.editionId}` : "/import?edition=cinematic-harbor",
      label: joinedCircle ? "Continue with your circle" : "Try a featured edition",
    },
    {
      title: "See the private audio path",
      body:
        "If your personal library already has DRM-free or converted audiobook files, the app now shows where that future import path will live.",
      href: "/import?source=audio",
      label: "View audio import plans",
    },
    {
      title: isSignedIn ? "Keep your progress portable" : "Create an account when you are ready",
      body: isSignedIn
        ? "Your current library can follow you across workspaces and browsers."
        : "Sign in later if you want your library, progress, and circles to travel with you.",
      href: "#account-context",
      label: isSignedIn ? "Open account" : "See account options",
    },
  ];

  return (
    <section className="rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#fffefb_0%,#ffffff_45%,#eef4ff_100%)] p-6 shadow-[0_24px_70px_-46px_rgba(28,25,23,0.42)]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
            Your next move
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-stone-950">
            Start with one clear action
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
            The product is easiest when you follow one immediate step, then decide whether you want discovery, account sync, or deeper tools after that.
          </p>
        </div>
        <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm text-stone-600 shadow-sm backdrop-blur">
          {listeningStreakDays > 0
            ? `${listeningStreakDays}-day listening streak`
            : "Library first. Everything else later."}
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-[1.6rem] border border-stone-200/80 bg-white/90 p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Best next action
          </p>
          <div className="mt-4 rounded-[1.1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              {personalizationPaused ? "Personalization paused" : pinnedReason?.label ?? homeReason.label}
            </p>
            <p className="mt-2 text-sm leading-6 text-emerald-900">
              {personalizationPaused
                ? "The app is temporarily using neutral discovery suggestions. Your saved signals are still here when you want them back."
                : pinnedReason?.detail ?? homeReason.detail}
            </p>
          </div>
          <h3 className="mt-3 text-xl font-semibold text-stone-950">
            {primaryAction.title}
          </h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
            {primaryAction.body}
          </p>
          <Link
            className="mt-5 inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
            href={primaryAction.href}
          >
            {primaryAction.label}
          </Link>
        </article>

        <div className="grid gap-4">
          {secondaryActions.map((action) => (
            <article
              key={action.title}
              className="rounded-[1.5rem] border border-stone-200/80 bg-white/85 p-5 shadow-sm"
            >
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
                Then
              </p>
              <h3 className="mt-2 text-lg font-semibold text-stone-950">{action.title}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">{action.body}</p>
              <Link
                className="mt-4 inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                href={action.href}
              >
                {action.label}
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
