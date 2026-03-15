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

export interface SyncedSocialState {
  savedEditions: SavedListeningEditionRecord[];
  circleMemberships: CircleMembershipRecord[];
}
