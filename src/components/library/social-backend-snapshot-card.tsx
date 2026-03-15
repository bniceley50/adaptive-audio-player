import { getAllPublicBookCircles } from "@/features/discovery/book-circles";
import { featuredListeningEditions } from "@/features/discovery/listening-editions";
import type { SyncedSocialState } from "@/lib/types/social";

function sortByRecent<
  T extends {
    savedAt?: string;
    joinedAt?: string;
    lastUsedAt?: string | null;
    lastOpenedAt?: string | null;
  },
>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(
      left.lastUsedAt ?? left.lastOpenedAt ?? left.savedAt ?? left.joinedAt ?? 0,
    ).getTime();
    const rightTime = new Date(
      right.lastUsedAt ?? right.lastOpenedAt ?? right.savedAt ?? right.joinedAt ?? 0,
    ).getTime();
    return rightTime - leftTime;
  });
}

function formatSnapshotTime(value: string | null | undefined) {
  if (!value) {
    return "No sync yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No sync yet";
  }

  return date.toLocaleString();
}

export function SocialBackendSnapshotCard({
  socialState,
  syncedAt,
}: {
  socialState: SyncedSocialState | null | undefined;
  syncedAt: string | null | undefined;
}) {
  const latestSavedEdition = sortByRecent(socialState?.savedEditions ?? [])[0] ?? null;
  const latestCircle = sortByRecent(socialState?.circleMemberships ?? [])[0] ?? null;

  const latestSavedEditionMeta = latestSavedEdition
    ? featuredListeningEditions.find((edition) => edition.id === latestSavedEdition.editionId) ??
      null
    : null;
  const allCircles = getAllPublicBookCircles(socialState ?? null);
  const latestCircleMeta = latestCircle
    ? allCircles.find((circle) => circle.id === latestCircle.circleId) ?? null
    : null;

  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-white shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
      <div className="border-b border-stone-200/80 bg-[linear-gradient(135deg,#fffdf7_0%,#f7f3ea_52%,#eef4ff_100%)] p-6">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
          Synced snapshot
        </p>
        <h2 className="mt-2 text-xl font-semibold text-stone-900">
          Server-backed social state
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
          This section is rendered from the current backend snapshot, so the social page has
          real saved state before any client hydration or browser memory restores kick in.
        </p>
      </div>
      <div className="grid gap-4 p-6 md:grid-cols-4">
        <article className="rounded-[1.4rem] border border-stone-200 bg-stone-50/80 p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Synced editions
          </p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">
            {socialState?.savedEditions.length ?? 0}
          </p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-stone-50/80 p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Synced circles
          </p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">
            {socialState?.circleMemberships.length ?? 0}
          </p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-stone-50/80 p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Circle shares
          </p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">
            {(socialState?.circleMemberships ?? []).reduce(
              (sum, entry) => sum + entry.shareCount,
              0,
            )}
          </p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-stone-50/80 p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Last synced
          </p>
          <p className="mt-3 text-sm font-semibold text-stone-950">
            {formatSnapshotTime(syncedAt)}
          </p>
        </article>
      </div>
      <div className="grid gap-4 border-t border-stone-200/80 p-6 md:grid-cols-2">
        <article className="rounded-[1.4rem] border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Latest synced edition
          </p>
          <p className="mt-3 text-sm font-semibold text-stone-950">
            {latestSavedEditionMeta?.title ?? "Nothing synced yet"}
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {latestSavedEditionMeta
              ? `${latestSavedEditionMeta.narratorName} · ${latestSavedEditionMeta.mode}`
              : "Save an edition and let workspace sync persist it to the backend snapshot."}
          </p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Latest synced circle
          </p>
          <p className="mt-3 text-sm font-semibold text-stone-950">
            {latestCircleMeta?.title ?? "Nothing synced yet"}
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {latestCircleMeta
              ? latestCircleMeta.checkpoint
              : "Join a circle and let workspace sync carry it into the backend snapshot."}
          </p>
        </article>
      </div>
    </section>
  );
}
