export { tastePresets } from "@/features/reader/shared-support";

export const narratorNames: Record<string, string> = {
  marlowe: "Marlowe",
  sloane: "Sloane",
  jules: "Jules",
};
export {
  getBookCoverTheme,
  getBookInitials,
  getUpdatedAtWeight,
} from "@/features/reader/shared-support";

export function buildPlayerListeningState({
  historicalArtifactId,
  renderState,
  preferredAudioKind,
}: {
  historicalArtifactId: string | null;
  renderState: "current" | "archived" | null;
  preferredAudioKind: "sample-generation" | "full-book-generation" | null;
}) {
  if (historicalArtifactId && renderState === "archived") {
    return {
      label: "Listening to an archived render",
      detail:
        "This session is using a preserved historical version, not the current approved render.",
      action: "Review the book timeline to compare archived and current audio",
    };
  }

  if (preferredAudioKind === "full-book-generation") {
    return {
      label: "Listening to the current full book",
      detail:
        "The backend has a current full-book render for this setup, so this is the main listening path.",
      action: "Stay in playback or jump back to the book timeline",
    };
  }

  if (preferredAudioKind === "sample-generation") {
    return {
      label: "Listening to the current sample",
      detail:
        "You are previewing the current sample for this narrator and mode before or instead of the full-book render.",
      action: "Use this to judge the taste or return to setup to render the full book",
    };
  }

  return {
    label: "Audio needs generation",
    detail:
      "This player opened without a generated render for the current taste, so playback is locked until setup creates one.",
    action: "Go back to setup and generate a sample first",
  };
}
