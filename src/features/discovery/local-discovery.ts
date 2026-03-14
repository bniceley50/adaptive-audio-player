export const discoveryChangedEvent = "adaptive-audio-player:discovery-changed";

const followedAuthorsStorageKey = "adaptive-audio-player.followed-authors";
const joinedCirclesStorageKey = "adaptive-audio-player.joined-circles";
const trackedPlannedFeaturesStorageKey =
  "adaptive-audio-player.tracked-planned-features";
const followedAuthorTimestampsStorageKey =
  "adaptive-audio-player.followed-author-timestamps";
const joinedCircleTimestampsStorageKey =
  "adaptive-audio-player.joined-circle-timestamps";
const trackedFeatureTimestampsStorageKey =
  "adaptive-audio-player.tracked-feature-timestamps";

type TimestampMap = Record<string, string>;

function emitDiscoveryChange() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(discoveryChangedEvent));
}

function readStringList(storageKey: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function readTimestampMap(storageKey: string): TimestampMap {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as TimestampMap) : {};
  } catch {
    return {};
  }
}

function writeStringList(storageKey: string, values: string[], emit = true) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(values));
  if (emit) {
    emitDiscoveryChange();
  }
}

function writeTimestampMap(storageKey: string, values: TimestampMap, emit = true) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(values));
  if (emit) {
    emitDiscoveryChange();
  }
}

function syncTimestampMapEntry(
  storageKey: string,
  id: string,
  isActive: boolean,
  emit = true,
): TimestampMap {
  const currentMap = readTimestampMap(storageKey);
  const nextMap = { ...currentMap };

  if (isActive) {
    nextMap[id] = new Date().toISOString();
  } else {
    delete nextMap[id];
  }

  writeTimestampMap(storageKey, nextMap, emit);
  return nextMap;
}

export function readFollowedAuthors(): string[] {
  return readStringList(followedAuthorsStorageKey);
}

export function writeFollowedAuthors(authorNames: string[]) {
  writeStringList(followedAuthorsStorageKey, authorNames);
}

export function readFollowedAuthorTimestamps(): TimestampMap {
  return readTimestampMap(followedAuthorTimestampsStorageKey);
}

export function toggleFollowedAuthor(authorName: string): string[] {
  const currentAuthors = readFollowedAuthors();
  const nextAuthors = currentAuthors.includes(authorName)
    ? currentAuthors.filter((currentAuthor) => currentAuthor !== authorName)
    : [...currentAuthors, authorName];

  writeStringList(followedAuthorsStorageKey, nextAuthors, false);
  syncTimestampMapEntry(
    followedAuthorTimestampsStorageKey,
    authorName,
    nextAuthors.includes(authorName),
  );
  return nextAuthors;
}

export function readJoinedCircles(): string[] {
  return readStringList(joinedCirclesStorageKey);
}

export function writeJoinedCircles(circleIds: string[]) {
  writeStringList(joinedCirclesStorageKey, circleIds);
}

export function readJoinedCircleTimestamps(): TimestampMap {
  return readTimestampMap(joinedCircleTimestampsStorageKey);
}

export function toggleJoinedCircle(circleId: string): string[] {
  const currentCircles = readJoinedCircles();
  const nextCircles = currentCircles.includes(circleId)
    ? currentCircles.filter((currentCircleId) => currentCircleId !== circleId)
    : [...currentCircles, circleId];

  writeStringList(joinedCirclesStorageKey, nextCircles, false);
  syncTimestampMapEntry(
    joinedCircleTimestampsStorageKey,
    circleId,
    nextCircles.includes(circleId),
  );
  return nextCircles;
}

export function readTrackedPlannedFeatures(): string[] {
  return readStringList(trackedPlannedFeaturesStorageKey);
}

export function writeTrackedPlannedFeatures(featureIds: string[]) {
  writeStringList(trackedPlannedFeaturesStorageKey, featureIds);
}

export function readTrackedFeatureTimestamps(): TimestampMap {
  return readTimestampMap(trackedFeatureTimestampsStorageKey);
}

export function toggleTrackedPlannedFeature(featureId: string): string[] {
  const currentFeatures = readTrackedPlannedFeatures();
  const nextFeatures = currentFeatures.includes(featureId)
    ? currentFeatures.filter((currentFeatureId) => currentFeatureId !== featureId)
    : [...currentFeatures, featureId];

  writeStringList(trackedPlannedFeaturesStorageKey, nextFeatures, false);
  syncTimestampMapEntry(
    trackedFeatureTimestampsStorageKey,
    featureId,
    nextFeatures.includes(featureId),
  );
  return nextFeatures;
}
