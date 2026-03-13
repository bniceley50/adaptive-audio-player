export function formatPlaybackTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatRelativeUpdate(updatedAt: string | null) {
  if (!updatedAt) {
    return null;
  }

  const diffMs = Date.now() - new Date(updatedAt).getTime();
  const diffMinutes = Math.max(Math.floor(diffMs / 60000), 0);

  if (diffMinutes < 1) {
    return "Updated just now";
  }

  if (diffMinutes < 60) {
    return `Updated ${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Updated ${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `Updated ${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

export function describeSessionArtifact(
  artifactKind: "sample-generation" | "full-book-generation" | null,
) {
  if (artifactKind === "full-book-generation") {
    return {
      badge: "Full book",
      detail: "Full-book audio",
      action: "Resume full book",
    };
  }

  if (artifactKind === "sample-generation") {
    return {
      badge: "Sample",
      detail: "Sample audio",
      action: "Resume sample",
    };
  }

  return {
    badge: "Player",
    detail: "Player session",
    action: "Resume player",
  };
}
