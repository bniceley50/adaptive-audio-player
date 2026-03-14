export const discoveryChangedEvent = "adaptive-audio-player:discovery-changed";

const followedAuthorsStorageKey = "adaptive-audio-player.followed-authors";
const joinedCirclesStorageKey = "adaptive-audio-player.joined-circles";

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

function writeStringList(storageKey: string, values: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(values));
  window.dispatchEvent(new CustomEvent(discoveryChangedEvent));
}

export function readFollowedAuthors(): string[] {
  return readStringList(followedAuthorsStorageKey);
}

export function writeFollowedAuthors(authorNames: string[]) {
  writeStringList(followedAuthorsStorageKey, authorNames);
}

export function toggleFollowedAuthor(authorName: string): string[] {
  const currentAuthors = readFollowedAuthors();
  const nextAuthors = currentAuthors.includes(authorName)
    ? currentAuthors.filter((currentAuthor) => currentAuthor !== authorName)
    : [...currentAuthors, authorName];

  writeFollowedAuthors(nextAuthors);
  return nextAuthors;
}

export function readJoinedCircles(): string[] {
  return readStringList(joinedCirclesStorageKey);
}

export function writeJoinedCircles(circleIds: string[]) {
  writeStringList(joinedCirclesStorageKey, circleIds);
}

export function toggleJoinedCircle(circleId: string): string[] {
  const currentCircles = readJoinedCircles();
  const nextCircles = currentCircles.includes(circleId)
    ? currentCircles.filter((currentCircleId) => currentCircleId !== circleId)
    : [...currentCircles, circleId];

  writeJoinedCircles(nextCircles);
  return nextCircles;
}
