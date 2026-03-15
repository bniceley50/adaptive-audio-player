import { AuthorSpotlightCard } from "@/components/library/author-spotlight-card";
import { BackendSyncCard } from "@/components/library/backend-sync-card";
import { BackendLibraryPreview } from "@/components/library/backend-library-preview";
import { BookCircleCard } from "@/components/library/book-circle-card";
import { BookCirclesFeedCard } from "@/components/library/book-circles-feed-card";
import { ComingNextCard } from "@/components/library/coming-next-card";
import { ContinueListeningRow } from "@/components/library/continue-listening-row";
import { DefaultPlaybackCard } from "@/components/library/default-playback-card";
import { DefaultTasteCard } from "@/components/library/default-taste-card";
import { DemoModeCard } from "@/components/library/demo-mode-card";
import { DiscoveryQuickStartCard } from "@/components/library/discovery-quick-start-card";
import { FavoritesHubCard } from "@/components/library/favorites-hub-card";
import { ForYouCard } from "@/components/library/for-you-card";
import { HomeNextStepCard } from "@/components/library/home-next-step-card";
import { LibraryHero } from "@/components/library/library-hero";
import { ListeningEditionsFeedCard } from "@/components/library/listening-editions-feed-card";
import { ListeningStatsCard } from "@/components/library/listening-stats-card";
import { ManageDiscoveryPreferencesCard } from "@/components/library/manage-discovery-preferences-card";
import { RecentQuotesCard } from "@/components/library/recent-quotes-card";
import { RecentPersonalizationCard } from "@/components/library/recent-personalization-card";
import { RecentTastesCard } from "@/components/library/recent-tastes-card";
import { SocialMemoryCard } from "@/components/library/social-memory-card";
import { WorkspaceAccountCard } from "@/components/library/workspace-account-card";
import { AppShell } from "@/components/shared/app-shell";
import { StudioDisclosure } from "@/components/shared/studio-disclosure";
import { getAuthorSpotlight } from "@/features/discovery/author-spotlights";
import {
  getUserById,
  getWorkerHeartbeat,
  getWorkspaceLibrarySnapshot,
  listAccountSessionsForUser,
  listEndedAccountSessionsForUser,
  listRecentSyncJobsForUser,
  listRecentSyncJobsForWorkspace,
  getWorkspaceSyncSummary,
  listWorkspacesForUser,
} from "@/lib/backend/sqlite";
import {
  readAccountIdFromRequest,
  readAccountSessionIdFromRequest,
  readWorkspaceIdFromRequest,
} from "@/lib/backend/workspace-session";

export default async function HomePage() {
  const renderedAt = new Date().toISOString();
  const workspaceId = await readWorkspaceIdFromRequest();
  const accountId = await readAccountIdFromRequest();
  const accountSessionId = await readAccountSessionIdFromRequest();
  const backendSummary = workspaceId
    ? getWorkspaceSyncSummary(workspaceId)
    : null;
  const workerHeartbeat = getWorkerHeartbeat();
  const currentUser = accountId ? getUserById(accountId) : null;
  const backendLibrarySnapshot = workspaceId
    ? getWorkspaceLibrarySnapshot(workspaceId)
    : null;
  const linkedWorkspaces = currentUser
    ? listWorkspacesForUser(currentUser.id, workspaceId)
    : [];
  const accountSessions = currentUser
    ? listAccountSessionsForUser(currentUser.id, accountSessionId)
    : [];
  const endedAccountSessions = currentUser
    ? listEndedAccountSessionsForUser(currentUser.id)
    : [];
  const recentSyncJobs = currentUser
    ? listRecentSyncJobsForUser(currentUser.id, 10)
    : workspaceId
      ? listRecentSyncJobsForWorkspace(workspaceId, 10)
      : [];
  const recentBackendJobs = recentSyncJobs.map((job) => {
    const matchingBook =
      backendLibrarySnapshot?.libraryBooks.find((book) => book.bookId === job.bookId) ??
      null;

    return {
      ...job,
      coverTheme: matchingBook?.coverTheme ?? null,
      coverLabel: matchingBook?.coverLabel ?? null,
      coverGlyph: matchingBook?.coverGlyph ?? null,
      genreLabel: matchingBook?.genreLabel ?? null,
    };
  });
  const latestSession = backendLibrarySnapshot
    ? [...backendLibrarySnapshot.playbackStates]
        .sort((left, right) => {
          const leftTime = new Date(left.state.updatedAt ?? 0).getTime();
          const rightTime = new Date(right.state.updatedAt ?? 0).getTime();
          return rightTime - leftTime;
        })
        .map((entry) => {
          const matchingBook = backendLibrarySnapshot.libraryBooks.find(
            (book) => book.bookId === entry.bookId,
          );
          if (!matchingBook) {
            return null;
          }

          return {
            bookId: entry.bookId,
            bookTitle: matchingBook.title,
            coverTheme: matchingBook.coverTheme ?? null,
            coverLabel: matchingBook.coverLabel ?? null,
            coverGlyph: matchingBook.coverGlyph ?? null,
            genreLabel: matchingBook.genreLabel ?? null,
            chapterIndex: entry.state.currentChapterIndex,
            progressSeconds: entry.state.progressSeconds,
            artifactKind: entry.state.playbackArtifactKind ?? null,
            updatedAt: entry.state.updatedAt ?? null,
            href:
              entry.state.playbackArtifactKind === "full-book-generation"
                ? `/player/${entry.bookId}?artifact=full`
                : entry.state.playbackArtifactKind === "sample-generation"
                  ? `/player/${entry.bookId}?artifact=sample`
                  : `/player/${entry.bookId}`,
          };
        })
        .filter((value): value is NonNullable<typeof value> => value !== null)
    : [];
  const recentSessions = latestSession.slice(0, 3);
  const currentLatestSession = recentSessions[0] ?? null;
  const latestSyncedBook = backendLibrarySnapshot?.libraryBooks[0] ?? null;
  const circleBook =
    (currentLatestSession
      ? backendLibrarySnapshot?.libraryBooks.find(
          (book) => book.bookId === currentLatestSession.bookId,
        ) ?? null
      : null) ??
    latestSyncedBook;
  const circleProfile = circleBook
    ? backendLibrarySnapshot?.listeningProfiles.find(
        (profile) => profile.bookId === circleBook.bookId,
      ) ?? backendLibrarySnapshot?.defaultListeningProfile ?? null
    : backendLibrarySnapshot?.defaultListeningProfile ?? null;
  const authorSpotlight = getAuthorSpotlight({
    bookId: currentLatestSession?.bookId ?? latestSyncedBook?.bookId ?? null,
    title: currentLatestSession?.bookTitle ?? latestSyncedBook?.title ?? null,
    genreLabel:
      currentLatestSession?.genreLabel ?? latestSyncedBook?.genreLabel ?? null,
  });
  const listeningStats = backendLibrarySnapshot
    ? {
        activeBooks: backendLibrarySnapshot.playbackStates.filter(
          (entry) =>
            entry.state.progressSeconds > 0 ||
            (entry.state.bookmarks?.length ?? 0) > 0,
        ).length,
        totalBookmarks: backendLibrarySnapshot.playbackStates.reduce(
          (sum, entry) => sum + (entry.state.bookmarks?.length ?? 0),
          0,
        ),
        listenedMinutes: Math.max(
          0,
          Math.round(
            backendLibrarySnapshot.playbackStates.reduce(
              (sum, entry) => sum + entry.state.progressSeconds,
              0,
            ) / 60,
          ),
        ),
        activeChapters: backendLibrarySnapshot.playbackStates.reduce(
          (sum, entry) => sum + entry.state.currentChapterIndex + 1,
          0,
        ),
        topBookTitle:
          [...backendLibrarySnapshot.playbackStates]
            .sort((left, right) => {
              const leftScore =
                left.state.progressSeconds + (left.state.bookmarks?.length ?? 0) * 60;
              const rightScore =
                right.state.progressSeconds + (right.state.bookmarks?.length ?? 0) * 60;
              return rightScore - leftScore;
            })
            .map(
              (entry) =>
                backendLibrarySnapshot.libraryBooks.find(
                  (book) => book.bookId === entry.bookId,
                )?.title,
            )
            .find(Boolean) ?? null,
        recentBooks: backendLibrarySnapshot.playbackStates.filter(
          (entry) => Boolean(entry.state.updatedAt),
        ).length,
        listeningStreakDays: (() => {
          const dayKeys = [...new Set(
            backendLibrarySnapshot.playbackStates
              .map((entry) => entry.state.updatedAt)
              .filter(Boolean)
              .map((value) => {
                const normalized = new Date(value as string);
                if (Number.isNaN(normalized.getTime())) {
                  return null;
                }

                normalized.setHours(0, 0, 0, 0);
                return normalized.getTime();
              })
              .filter((value): value is number => value !== null),
          )].sort((left, right) => right - left);

          if (dayKeys.length === 0) {
            return 0;
          }

          let streak = 0;
          let cursor = new Date();
          cursor.setHours(0, 0, 0, 0);

          for (const dayKey of dayKeys) {
            if (dayKey === cursor.getTime()) {
              streak += 1;
              cursor = new Date(cursor.getTime() - 1000 * 60 * 60 * 24);
              continue;
            }

            if (streak === 0 && dayKey === cursor.getTime() - 1000 * 60 * 60 * 24) {
              streak += 1;
              cursor = new Date(dayKey - 1000 * 60 * 60 * 24);
              continue;
            }

            break;
          }

          return streak;
        })(),
      }
    : {
        activeBooks: 0,
        totalBookmarks: 0,
        listenedMinutes: 0,
        activeChapters: 0,
        topBookTitle: null,
        recentBooks: 0,
        listeningStreakDays: 0,
      };
  return (
    <AppShell eyebrow="Adaptive audiobooks" title="Choose how your audiobook sounds">
      <LibraryHero />
      <DemoModeCard />
      <HomeNextStepCard
        hasSyncedBook={Boolean(latestSyncedBook)}
        latestBookTitle={latestSyncedBook?.title ?? null}
      latestBookHref={latestSyncedBook ? `/player/${latestSyncedBook.bookId}` : null}
      isSignedIn={Boolean(currentUser)}
      listeningStreakDays={listeningStats.listeningStreakDays}
      recommendedEdition={authorSpotlight?.recommendedEdition ?? null}
      spotlightName={authorSpotlight?.name ?? null}
    />
      <section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              Everyday listening
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-950">
              Start fast, then let the app get smarter around you
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              Discovery, playback, circles, and favorites stay up front. Account,
              backend, and deeper system controls stay available without taking over the
              first-run experience.
            </p>
          </div>
          <div className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-600 shadow-sm">
            Everyday mode stays focused on what to hear next
          </div>
        </div>

        <DiscoveryQuickStartCard spotlight={authorSpotlight} />
        <ForYouCard spotlight={authorSpotlight} />
        <RecentPersonalizationCard />
        <SocialMemoryCard />
        <ManageDiscoveryPreferencesCard />
        <ListeningStatsCard initialStats={listeningStats} />
        <FavoritesHubCard />
        <ComingNextCard />
        <ListeningEditionsFeedCard />
        <ContinueListeningRow initialSnapshot={backendLibrarySnapshot} hideWhenEmpty />
        <RecentQuotesCard />
        {circleBook ? (
          <BookCircleCard
            bookId={circleBook.bookId}
            bookTitle={circleBook.title}
            coverGlyph={circleBook.coverGlyph ?? null}
            coverLabel={circleBook.coverLabel ?? null}
            coverTheme={circleBook.coverTheme ?? null}
            genreLabel={circleBook.genreLabel ?? null}
            href={
              currentLatestSession && currentLatestSession.bookId === circleBook.bookId
                ? currentLatestSession.href
                : `/player/${circleBook.bookId}`
            }
            mode={circleProfile?.mode ?? null}
            narratorName={circleProfile?.narratorName ?? null}
          />
        ) : null}
        <BookCirclesFeedCard />
        <AuthorSpotlightCard spotlight={authorSpotlight} title="Author spotlight" />
      </section>

      <section id="account-context">
        <StudioDisclosure
          eyebrow="Account"
          title="Account"
          detail="Open sign-in, linked workspaces, and session controls when you want to sync the listening experience across devices and libraries."
          badgeLabel="Open sign-in, workspaces, and session controls"
          defaultOpen={Boolean(currentUser)}
        >
          <WorkspaceAccountCard
            currentUser={currentUser}
            currentWorkspaceId={workspaceId}
            linkedWorkspaces={linkedWorkspaces}
            accountSessions={accountSessions}
            endedAccountSessions={endedAccountSessions}
            renderedAt={renderedAt}
          />
        </StudioDisclosure>
      </section>

      <section id="studio">
        <StudioDisclosure
          detail="Open this when you want to manage defaults, understand the listening hierarchy, inspect synced restore state, or verify backend health. Everyday listening stays above."
          title="Defaults, synced titles, and backend health"
        >
          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-6">
              <div id="default-taste">
                <DefaultTasteCard
                  initialProfile={backendLibrarySnapshot?.defaultListeningProfile ?? null}
                />
              </div>
              <RecentTastesCard />
              <div id="default-playback">
                <DefaultPlaybackCard
                  initialDefaults={backendLibrarySnapshot?.playbackDefaults ?? null}
                />
              </div>
              <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-white shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
                <div className="border-b border-stone-200/80 bg-[linear-gradient(135deg,#fffdf7_0%,#f7f3ea_52%,#eef4ff_100%)] p-6">
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
                    Listening model
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-stone-900">
                    How taste works
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
                    The app uses a simple hierarchy so each book is predictable instead of
                    mysterious.
                  </p>
                </div>
                <div className="grid gap-4 p-6 md:grid-cols-3">
                  <article className="rounded-[1.5rem] border border-stone-200 bg-stone-50/80 p-4 shadow-sm">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                      Saved taste
                    </p>
                    <p className="mt-2 text-sm leading-6 text-stone-600">
                      A book-specific listening profile. This book keeps it until you change
                      it.
                    </p>
                  </article>
                  <article className="rounded-[1.5rem] border border-stone-200 bg-stone-50/80 p-4 shadow-sm">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                      Default taste
                    </p>
                    <p className="mt-2 text-sm leading-6 text-stone-600">
                      Your preferred narrator and mode for brand-new imports.
                    </p>
                  </article>
                  <article className="rounded-[1.5rem] border border-stone-200 bg-stone-50/80 p-4 shadow-sm">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                      Latest taste
                    </p>
                    <p className="mt-2 text-sm leading-6 text-stone-600">
                      A fallback from the most recent book when no global default is saved.
                    </p>
                  </article>
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-stone-950 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white">
                  Backend
                </span>
                <p className="text-sm text-stone-500">
                  What the server can restore immediately and what it is processing right now.
                </p>
              </div>
              <BackendLibraryPreview snapshot={backendLibrarySnapshot} />
              <BackendSyncCard
                summary={backendSummary}
                recentJobs={recentBackendJobs}
                latestSession={currentLatestSession}
                recentSessions={recentSessions}
                workerHeartbeat={workerHeartbeat}
                renderedAt={renderedAt}
              />
            </div>
          </div>
        </StudioDisclosure>
      </section>

      <section
        id="featured"
        className="grid gap-4 rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(180deg,#fffefb_0%,#ffffff_100%)] p-6 shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)] md:grid-cols-3"
      >
        {[
          {
            title: "Classic narration",
            body: "A clean read for focus, long sessions, and minimal production texture.",
          },
          {
            title: "Ambient scenes",
            body: "Light atmosphere around the voice so books feel bigger without getting noisy.",
          },
          {
            title: "Immersive listening",
            body: "The more cinematic side of the product, built for standout story moments.",
          },
        ].map((item) => (
          <article
            key={item.title}
            className="rounded-[1.5rem] border border-stone-200 bg-stone-50/80 p-5 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-stone-900">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">{item.body}</p>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
