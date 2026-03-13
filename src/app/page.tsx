import { BackendSyncCard } from "@/components/library/backend-sync-card";
import { BackendLibraryPreview } from "@/components/library/backend-library-preview";
import { BookCircleCard } from "@/components/library/book-circle-card";
import { ContinueListeningRow } from "@/components/library/continue-listening-row";
import { DefaultPlaybackCard } from "@/components/library/default-playback-card";
import { DefaultTasteCard } from "@/components/library/default-taste-card";
import { DemoModeCard } from "@/components/library/demo-mode-card";
import { LibraryHero } from "@/components/library/library-hero";
import { ListeningStatsCard } from "@/components/library/listening-stats-card";
import { RecentQuotesCard } from "@/components/library/recent-quotes-card";
import { RecentTastesCard } from "@/components/library/recent-tastes-card";
import { WorkspaceAccountCard } from "@/components/library/workspace-account-card";
import { AppShell } from "@/components/shared/app-shell";
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
  const primaryAction = latestSyncedBook
    ? {
        title: "Resume a synced title",
        body: `Jump back into ${latestSyncedBook.title} and keep the listening loop moving.`,
        href: `/player/${latestSyncedBook.bookId}`,
        eyebrow: "Start here",
      }
    : {
        title: "Import your first book",
        body: "Bring in a title and watch the setup, generation, and playback flow come to life.",
        href: "/import",
        eyebrow: "Start here",
      };
  const quickActions = [
    primaryAction,
    {
      title: currentUser ? "Check account security" : "Create a workspace account",
      body: currentUser
        ? "Review active sessions, connected workspaces, and recent account activity."
        : "Turn the local workspace into a signed-in identity with sync and session controls.",
      href: "#account-context",
      eyebrow: "Then",
    },
    {
      title: "Inspect backend intelligence",
      body: "See synced titles, current renders, listening sessions, and active generation work.",
      href: "#system-intelligence",
      eyebrow: "Then",
    },
  ];

  return (
    <AppShell eyebrow="Adaptive audiobooks" title="Choose how your audiobook sounds">
      <LibraryHero />
      <DemoModeCard />
      <section className="rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#fffefb_0%,#ffffff_45%,#eef4ff_100%)] p-6 shadow-[0_24px_70px_-46px_rgba(28,25,23,0.42)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              Start here
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-950">
              The fastest way to understand the product
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              Follow these three actions in order to see the listening product, the
              account model, and the backend system working together.
            </p>
          </div>
          <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm text-stone-600 shadow-sm backdrop-blur">
            Library first. Account second. Backend third.
          </div>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {quickActions.map((action) => (
            <a
              key={action.title}
              href={action.href}
              className="group rounded-[1.5rem] border border-stone-200/80 bg-white/85 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
                {action.eyebrow}
              </p>
              <h3 className="mt-2 text-lg font-semibold text-stone-950 transition group-hover:text-stone-700">
                {action.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">{action.body}</p>
              <p className="mt-4 text-sm font-medium text-stone-900">Open section →</p>
            </a>
          ))}
        </div>
      </section>
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              Library command center
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-950">
              What to listen to and what account it belongs to
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              The left side is the listening product: imports, resume state, and taste.
              The right side is the security and ownership model behind it.
            </p>
          </div>
          <div className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-600 shadow-sm">
            Home is split into library context and account context.
          </div>
        </div>
        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-stone-950 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white">
                Library
              </span>
              <p className="text-sm text-stone-500">
                Start with the listening experience, then move into setup or playback.
              </p>
            </div>
          <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#f7ecd8_0%,#fffdf7_42%,#eef4ff_100%)] shadow-[0_24px_70px_-46px_rgba(28,25,23,0.42)]">
            <div className="grid gap-4 p-6 md:grid-cols-3">
              <article className="rounded-[1.5rem] border border-white/80 bg-white/80 p-5 shadow-sm backdrop-blur">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
                  Step 1
                </p>
                <h2 className="mt-2 text-lg font-semibold text-stone-950">
                  Import and parse
                </h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Bring in a manuscript or book file and let the app shape it into
                  chapters.
                </p>
              </article>
              <article className="rounded-[1.5rem] border border-white/80 bg-white/80 p-5 shadow-sm backdrop-blur">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
                  Step 2
                </p>
                <h2 className="mt-2 text-lg font-semibold text-stone-950">
                  Design the taste
                </h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Choose the narrator, listening mode, and defaults that define the
                  experience.
                </p>
              </article>
              <article className="rounded-[1.5rem] border border-white/80 bg-white/80 p-5 shadow-sm backdrop-blur">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
                  Step 3
                </p>
                <h2 className="mt-2 text-lg font-semibold text-stone-950">
                  Listen and orchestrate
                </h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Resume playback, monitor jobs, and prove the backend is doing real work.
                </p>
              </article>
            </div>
          </section>

          <ListeningStatsCard initialStats={listeningStats} />
          <ContinueListeningRow initialSnapshot={backendLibrarySnapshot} />
          <RecentQuotesCard />
          {circleBook ? (
            <BookCircleCard
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
        </div>

          <div id="account-context" className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-600 shadow-sm">
                Account
              </span>
              <p className="text-sm text-stone-500">
                Security, linked workspaces, and signed-in identity for the same library.
              </p>
            </div>
            <WorkspaceAccountCard
              currentUser={currentUser}
              currentWorkspaceId={workspaceId}
              linkedWorkspaces={linkedWorkspaces}
              accountSessions={accountSessions}
              endedAccountSessions={endedAccountSessions}
              renderedAt={renderedAt}
            />
          </div>
        </div>
      </section>

      <section id="system-intelligence" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              System intelligence
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-950">
              Defaults, synced titles, and backend health
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              This section explains how new books inherit taste, what the server can restore,
              and whether the backend is keeping up with the product experience.
            </p>
          </div>
          <div className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-600 shadow-sm">
            Preferences on the left, restore and queue state on the right.
          </div>
          </div>
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
