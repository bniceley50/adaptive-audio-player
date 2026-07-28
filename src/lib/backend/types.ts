import type { NarrationEngineId } from "@/lib/narration/engines";

export interface WorkerHeartbeatSummary {
  workerName: string;
  status: "idle" | "processing" | "stopped";
  lastHeartbeatAt: string;
  startedAt: string;
  lastJobId: string | null;
  lastJobKind: GenerationJobKind | null;
  lastJobStatus: "running" | "completed" | "failed" | null;
}

export interface SyncJobSummary {
  id: string;
  workspaceId: string;
  kind: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  books: number;
  profiles: number;
  playbackStates: number;
  bookId: string | null;
  bookTitle: string | null;
  narratorId: string | null;
  engineId?: NarrationEngineId;
  mode: string | null;
  chapterCount: number | null;
  renderProgress: GenerationJobProgressSummary | null;
  playableArtifactKind: GenerationJobKind | null;
  resumePath: string | null;
}

export type GenerationJobKind = "sample-generation" | "full-book-generation";
export type GenerationOutputProvider =
  | "chatterbox-local"
  | "kokoro-local"
  | "openai"
  | "mock";

export interface GenerationJobProgressSummary {
  totalChapters: number;
  completedChapters: number;
  currentChapterIndex: number | null;
  currentChapterTitle: string | null;
}

export interface GenerationOutputSummary {
  workspaceId: string;
  bookId: string;
  kind: GenerationJobKind;
  narratorId: string | null;
  engineId?: NarrationEngineId;
  mode: string | null;
  chapterCount: number | null;
  assetPath: string;
  mimeType: string;
  provider: GenerationOutputProvider;
  generatedAt: string;
  chapterIndex?: number | null;
  chapterTitle?: string | null;
  chapterAssetPaths?: string[];
  isChapterArtifact?: boolean;
}

export interface GenerationArtifactSummary extends GenerationOutputSummary {
  id: string;
  jobId: string;
}

export interface PublicGenerationArtifactReference {
  artifactId: string;
  artifactUrl: string;
  chapterIndex: number | null;
  chapterTitle: string | null;
}

export interface PublicGenerationOutputSummary {
  artifactId: string | null;
  artifactUrl: string;
  bookId: string;
  kind: GenerationJobKind;
  narratorId: string | null;
  engineId?: NarrationEngineId;
  mode: string | null;
  chapterCount: number | null;
  mimeType: string;
  provider: GenerationOutputProvider;
  generatedAt: string;
  jobId: string | null;
  chapterIndex: number | null;
  chapterTitle: string | null;
  chapterArtifacts: PublicGenerationArtifactReference[];
  isChapterArtifact: boolean;
  isCurrent: boolean;
}

export interface SyncedBookDisplayMeta {
  bookId: string;
  title: string;
  coverTheme: string | null;
  coverLabel: string | null;
  coverGlyph: string | null;
  genreLabel: string | null;
}
