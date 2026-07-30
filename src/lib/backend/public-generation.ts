import type {
  GenerationArtifactSummary,
  GenerationOutputSummary,
  PublicGenerationArtifactReference,
  PublicGenerationOutputSummary,
  SyncJobSummary,
} from "./types";

export function toPublicGenerationJob(job: SyncJobSummary) {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    errorMessage: job.errorMessage,
    bookId: job.bookId,
    bookTitle: job.bookTitle,
    narratorId: job.narratorId,
    engineId: job.engineId,
    mode: job.mode,
    chapterCount: job.chapterCount,
    renderProgress: job.renderProgress,
    playableArtifactKind: job.playableArtifactKind,
    resumePath: job.resumePath,
  };
}

function buildCurrentArtifactUrl(output: GenerationOutputSummary) {
  return `/api/audio/generated/${encodeURIComponent(output.bookId)}?kind=${output.kind}`;
}

function buildArchivedArtifactUrl(artifactId: string) {
  return `/api/audio/generated/artifacts/${encodeURIComponent(artifactId)}`;
}

function isArtifactCurrent(
  artifact: GenerationArtifactSummary,
  outputs: readonly GenerationOutputSummary[],
) {
  const currentOutput = outputs.find(
    (output) => output.bookId === artifact.bookId && output.kind === artifact.kind,
  );
  if (!currentOutput) {
    return false;
  }

  if (artifact.isChapterArtifact) {
    return Boolean(
      currentOutput.chapterAssetPaths?.includes(artifact.assetPath),
    );
  }

  return (
    currentOutput.assetPath === artifact.assetPath &&
    currentOutput.generatedAt === artifact.generatedAt
  );
}

function toPublicArtifactReference(
  artifact: GenerationArtifactSummary,
): PublicGenerationArtifactReference {
  return {
    artifactId: artifact.id,
    artifactUrl: buildArchivedArtifactUrl(artifact.id),
    chapterIndex: artifact.chapterIndex ?? null,
    chapterTitle: artifact.chapterTitle ?? null,
  };
}

export function toPublicGenerationOutput(
  output: GenerationOutputSummary,
  artifacts: readonly GenerationArtifactSummary[] = [],
): PublicGenerationOutputSummary {
  const currentArtifact = artifacts.find(
    (artifact) =>
      !artifact.isChapterArtifact &&
      artifact.bookId === output.bookId &&
      artifact.kind === output.kind &&
      artifact.assetPath === output.assetPath &&
      artifact.generatedAt === output.generatedAt,
  );
  const chapterArtifacts = artifacts
    .filter(
      (artifact) =>
        artifact.isChapterArtifact &&
        artifact.bookId === output.bookId &&
        artifact.kind === output.kind &&
        output.chapterAssetPaths?.includes(artifact.assetPath),
    )
    .map(toPublicArtifactReference);

  return {
    artifactId: currentArtifact?.id ?? null,
    artifactUrl: currentArtifact
      ? buildArchivedArtifactUrl(currentArtifact.id)
      : buildCurrentArtifactUrl(output),
    bookId: output.bookId,
    chapterArtifacts,
    chapterTimings: output.chapterTimings ?? [],
    chapterCount: output.chapterCount,
    chapterIndex: output.chapterIndex ?? null,
    chapterTitle: output.chapterTitle ?? null,
    generatedAt: output.generatedAt,
    isChapterArtifact: output.isChapterArtifact === true,
    isCurrent: true,
    jobId: currentArtifact?.jobId ?? null,
    kind: output.kind,
    mimeType: output.mimeType,
    mode: output.mode,
    narratorId: output.narratorId,
    engineId: output.engineId,
    provider: output.provider,
  };
}

export function toPublicGenerationArtifact(
  artifact: GenerationArtifactSummary,
  outputs: readonly GenerationOutputSummary[],
): PublicGenerationOutputSummary {
  return {
    artifactId: artifact.id,
    artifactUrl: buildArchivedArtifactUrl(artifact.id),
    bookId: artifact.bookId,
    chapterArtifacts: [],
    chapterTimings: artifact.chapterTimings ?? [],
    chapterCount: artifact.chapterCount,
    chapterIndex: artifact.chapterIndex ?? null,
    chapterTitle: artifact.chapterTitle ?? null,
    generatedAt: artifact.generatedAt,
    isChapterArtifact: artifact.isChapterArtifact === true,
    isCurrent: isArtifactCurrent(artifact, outputs),
    jobId: artifact.jobId,
    kind: artifact.kind,
    mimeType: artifact.mimeType,
    mode: artifact.mode,
    narratorId: artifact.narratorId,
    engineId: artifact.engineId,
    provider: artifact.provider,
  };
}
