import { notFound } from "next/navigation";
import { SocialMomentDetailCard } from "@/components/library/social-moment-detail-card";
import { AppShell } from "@/components/shared/app-shell";
import { getPublicMomentDetail } from "@/features/social/public-moments";
import { getSocialCommunityPulse, listRecentSocialActivityEvents } from "@/lib/backend/sqlite";

export default async function SocialMomentPage({
  params,
}: {
  params: Promise<{ momentId: string }>;
}) {
  const { momentId } = await params;
  const pulse = getSocialCommunityPulse();
  const events = listRecentSocialActivityEvents(12);
  const detail = getPublicMomentDetail(momentId, pulse, events);

  if (!detail) {
    notFound();
  }

  return (
    <AppShell eyebrow="Public moment" title={detail.moment.bookTitle}>
      <SocialMomentDetailCard
        moment={detail.moment}
        edition={detail.edition}
        circle={detail.circle}
        activity={detail.activity}
        relatedMoments={detail.relatedMoments}
      />
    </AppShell>
  );
}
