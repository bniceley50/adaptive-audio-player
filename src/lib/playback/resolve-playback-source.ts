import type {
  GenerationJobKind,
  PublicGenerationOutputSummary,
} from "@/lib/backend/types";

export type PlaybackArtifactKind = GenerationJobKind;
export type PlaybackSourceVersion = "archived" | "current" | null;

export interface ResolvePlaybackSourceInput {
  artifacts: readonly PublicGenerationOutputSummary[];
  bookId: string;
  currentOutputs: readonly PublicGenerationOutputSummary[];
  narratorNames?: Readonly<Record<string, string>>;
  persistedKind?: GenerationJobKind | null;
  requestedArtifactId?: string | null;
  requestedKind?: GenerationJobKind | null;
}

export interface ResolvedPlaybackSource {
  artifactId: string | null;
  artifactKind: PlaybackArtifactKind | null;
  audioUrl: string | null;
  isReady: boolean;
  narratorId: string | null;
  narratorName: string;
  version: PlaybackSourceVersion;
}

const unavailableSource: ResolvedPlaybackSource = {
  artifactId: null,
  artifactKind: null,
  audioUrl: null,
  isReady: false,
  narratorId: null,
  narratorName: "Narrator unavailable",
  version: null,
};

function resolveNarratorMetadata(
  record: PublicGenerationOutputSummary,
  narratorNames: Readonly<Record<string, string>>,
) {
  const narratorId = record.narratorId?.trim().toLowerCase() || null;

  return {
    narratorId,
    narratorName: narratorId
      ? narratorNames[narratorId] ?? narratorId
      : "Narrator unavailable",
  };
}

function recordBelongsToSelection(
  record: PublicGenerationOutputSummary,
  bookId: string,
): boolean {
  return (
    record.bookId === bookId &&
    record.artifactUrl.trim().length > 0
  );
}

function resolveGeneratedSource(
  record: PublicGenerationOutputSummary,
  input: {
    narratorNames: Readonly<Record<string, string>>;
    version: Exclude<PlaybackSourceVersion, null>;
  },
): ResolvedPlaybackSource {
  return {
    artifactId: record.artifactId,
    artifactKind: record.kind,
    audioUrl: record.artifactUrl,
    isReady: true,
    ...resolveNarratorMetadata(record, input.narratorNames),
    version: input.version,
  };
}

export function resolvePlaybackSource({
  artifacts,
  bookId,
  currentOutputs,
  narratorNames = {},
  persistedKind = null,
  requestedArtifactId = null,
  requestedKind = null,
}: ResolvePlaybackSourceInput): ResolvedPlaybackSource {
  const explicitArtifactId = requestedArtifactId?.trim() || null;
  const validCurrentOutputs = currentOutputs.filter((record) =>
    recordBelongsToSelection(record, bookId),
  );

  if (explicitArtifactId) {
    const selectedArtifact = artifacts.find(
      (entry) => entry.artifactId === explicitArtifactId,
    );

    if (
      !selectedArtifact ||
      !recordBelongsToSelection(selectedArtifact, bookId)
    ) {
      return unavailableSource;
    }

    return resolveGeneratedSource(selectedArtifact, {
      narratorNames,
      version: selectedArtifact.isCurrent ? "current" : "archived",
    });
  }

  if (requestedKind) {
    const selectedOutput = validCurrentOutputs.find(
      (output) => output.kind === requestedKind,
    );

    return selectedOutput
      ? resolveGeneratedSource(selectedOutput, {
          narratorNames,
          version: "current",
        })
      : unavailableSource;
  }

  const persistedGeneratedKind =
    persistedKind === "sample-generation" ||
    persistedKind === "full-book-generation"
      ? persistedKind
      : null;
  const selectedOutput =
    (persistedGeneratedKind
      ? validCurrentOutputs.find(
          (output) => output.kind === persistedGeneratedKind,
        )
      : null) ??
    validCurrentOutputs.find(
      (output) => output.kind === "full-book-generation",
    ) ??
    validCurrentOutputs.find((output) => output.kind === "sample-generation") ??
    null;

  return selectedOutput
    ? resolveGeneratedSource(selectedOutput, {
        narratorNames,
        version: "current",
      })
    : unavailableSource;
}
