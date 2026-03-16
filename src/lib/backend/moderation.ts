import { getModerationReviewerEmails } from "@/lib/backend/env";
import { getUserById } from "@/lib/backend/sqlite";

export function isModerationReviewerAccount(accountId: string | null | undefined) {
  if (!accountId) {
    return false;
  }

  const user = getUserById(accountId);
  if (!user) {
    return false;
  }

  const reviewers = getModerationReviewerEmails();
  return reviewers.includes(user.email.trim().toLowerCase());
}
