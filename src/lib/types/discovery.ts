export type DiscoveryTimestampMap = Record<string, string>;

export type PinnedDiscoverySignal = {
  kind: "circle" | "author" | "feature";
  id: string;
} | null;

export interface SyncedDiscoveryPreferences {
  followedAuthors: string[];
  joinedCircles: string[];
  trackedPlannedFeatures: string[];
  followedAuthorTimestamps: DiscoveryTimestampMap;
  joinedCircleTimestamps: DiscoveryTimestampMap;
  trackedFeatureTimestamps: DiscoveryTimestampMap;
  pinnedDiscoverySignal: PinnedDiscoverySignal;
  personalizationPaused: boolean;
}
