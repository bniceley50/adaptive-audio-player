export interface SavedListeningEditionRecord {
  editionId: string;
  savedAt: string;
  lastUsedAt: string | null;
}

export interface CircleMembershipRecord {
  circleId: string;
  joinedAt: string;
  lastOpenedAt: string | null;
  shareCount: number;
}

export interface PromotedSocialMomentRecord {
  id: string;
  bookId: string;
  bookTitle: string;
  chapterIndex: number;
  chapterLabel: string;
  progressSeconds: number;
  quoteText: string;
  promotedAt: string;
  editionId: string | null;
  circleId: string | null;
}

export interface SyncedSocialState {
  savedEditions: SavedListeningEditionRecord[];
  circleMemberships: CircleMembershipRecord[];
  promotedMoments: PromotedSocialMomentRecord[];
}
