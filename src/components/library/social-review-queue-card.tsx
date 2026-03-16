import Link from "next/link";
import type {
  PublicSocialModerationStatus,
  PublicSocialCircleRecord,
  PublicSocialMomentRecord,
} from "@/lib/backend/types";

function formatReviewTime(value: string | null) {
  if (!value) {
    return "No report time yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No report time yet";
  }

  return date.toLocaleString();
}

type ReviewItem =
  | {
      kind: "circle";
      id: string;
      title: string;
      subtitle: string;
      moderationStatus: PublicSocialModerationStatus;
      reportCount: number;
      lastReportedAt: string | null;
      href: string;
    }
  | {
      kind: "moment";
      id: string;
      title: string;
      subtitle: string;
      moderationStatus: PublicSocialModerationStatus;
      reportCount: number;
      lastReportedAt: string | null;
      href: string;
    };

function buildQueueItems(
  circles: PublicSocialCircleRecord[],
  moments: PublicSocialMomentRecord[],
): ReviewItem[] {
  return [
    ...circles.map((circle) => ({
      kind: "circle" as const,
      id: circle.id,
      title: circle.title,
      subtitle: `${circle.bookTitle} · hosted by ${circle.ownerDisplayName?.trim() || circle.host}`,
      moderationStatus: circle.moderationStatus,
      reportCount: circle.reportCount,
      lastReportedAt: circle.lastReportedAt,
      href: `/social/circles/${circle.id}?entry=review-queue`,
    })),
    ...moments.map((moment) => ({
      kind: "moment" as const,
      id: moment.id,
      title: moment.bookTitle,
      subtitle: `“${moment.quoteText}”`,
      moderationStatus: moment.moderationStatus,
      reportCount: moment.reportCount,
      lastReportedAt: moment.lastReportedAt,
      href: `/social/moments/${moment.id}?entry=review-queue`,
    })),
  ].sort((left, right) => {
    const leftHidden = left.moderationStatus === "hidden" ? 1 : 0;
    const rightHidden = right.moderationStatus === "hidden" ? 1 : 0;
    if (leftHidden !== rightHidden) {
      return leftHidden - rightHidden;
    }

    return (
      new Date(right.lastReportedAt ?? 0).getTime() -
      new Date(left.lastReportedAt ?? 0).getTime()
    );
  });
}

export function SocialReviewQueueCard({
  circles,
  moments,
}: {
  circles: PublicSocialCircleRecord[];
  moments: PublicSocialMomentRecord[];
}) {
  const items = buildQueueItems(circles, moments);

  if (items.length === 0) {
    return null;
  }

  const reviewCount = items.filter((item) => item.moderationStatus === "review").length;
  const hiddenCount = items.filter((item) => item.moderationStatus === "hidden").length;

  return (
    <section className="overflow-hidden rounded-[2rem] border border-amber-200 bg-[linear-gradient(135deg,#fff8eb_0%,#ffffff_52%,#f4f7ff_100%)] shadow-[0_22px_60px_-42px_rgba(146,64,14,0.28)]">
      <div className="border-b border-amber-200/70 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-amber-700">
              Moderation queue
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-900">
              Review the public circles and moments you own
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-700">
              Public content that has been reported or hidden stays manageable here. Open
              an item to hide it, restore it, or confirm that it should stay visible.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.1rem] border border-amber-200 bg-white/90 px-4 py-3 shadow-sm">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-stone-500">
                Under review
              </p>
              <p className="mt-2 text-lg font-semibold text-stone-950">{reviewCount}</p>
            </div>
            <div className="rounded-[1.1rem] border border-stone-200 bg-white/90 px-4 py-3 shadow-sm">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-stone-500">
                Hidden by you
              </p>
              <p className="mt-2 text-lg font-semibold text-stone-950">{hiddenCount}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="grid gap-4 p-6 xl:grid-cols-2">
        {items.map((item) => (
          <article
            key={`${item.kind}-${item.id}`}
            className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
              <span className="rounded-full bg-stone-100 px-2.5 py-1">
                {item.kind === "circle" ? "Circle" : "Moment"}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 ${
                  item.moderationStatus === "hidden"
                    ? "bg-stone-100 text-stone-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {item.moderationStatus === "hidden" ? "Hidden" : "Under review"}
              </span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                {item.reportCount} report{item.reportCount === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-4 text-base font-semibold text-stone-950">{item.title}</p>
            <p className="mt-2 text-sm leading-6 text-stone-600">{item.subtitle}</p>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Last report: {formatReviewTime(item.lastReportedAt)}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                className="rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
                href={item.href}
              >
                Review item
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
