import type {
  LocalLibraryBook,
  LocalListeningProfile,
  LocalSampleRequest,
} from "@/lib/library/local-library";
import type {
  PersistedPlaybackState,
  PlaybackDefaults,
} from "@/lib/playback/local-playback";

export interface SyncedDraftText {
  bookId: string;
  text: string;
}

export interface SyncedPlaybackStateRecord {
  bookId: string;
  state: PersistedPlaybackState;
}

export interface LibrarySyncSnapshot {
  libraryBooks: LocalLibraryBook[];
  draftTexts: SyncedDraftText[];
  listeningProfiles: LocalListeningProfile[];
  defaultListeningProfile: LocalListeningProfile | null;
  sampleRequest: LocalSampleRequest | null;
  playbackStates: SyncedPlaybackStateRecord[];
  playbackDefaults: PlaybackDefaults | null;
  generationOutputs?: GenerationOutputSummary[];
  syncedAt: string;
}

export interface WorkspaceSyncSummary {
  workspaceId: string;
  syncedBookCount: number;
  syncedProfileCount: number;
  syncedPlaybackCount: number;
  generatedOutputCount: number;
  lastSyncedAt: string | null;
  lastJobStatus: string | null;
}

export interface WorkerHeartbeatSummary {
  workerName: string;
  status: "idle" | "processing" | "stopped";
  lastHeartbeatAt: string;
  startedAt: string;
  lastJobId: string | null;
  lastJobKind: GenerationJobKind | null;
  lastJobStatus: "running" | "completed" | "failed" | null;
}

export interface BackendUser {
  id: string;
  email: string;
  displayName: string;
  sessionVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackendAccountSession {
  id: string;
  userId: string;
  label: string | null;
  lastActivityPath: string | null;
  lastActivityLabel: string | null;
  expiresAt: string;
  lastUsedAt: string;
  revokedAt: string | null;
  endedReason: string | null;
  createdAt: string;
}

export interface UserAccountSessionSummary {
  id: string;
  label: string | null;
  lastActivityPath: string | null;
  lastActivityLabel: string | null;
  expiresAt: string;
  lastUsedAt: string;
  createdAt: string;
  isCurrent: boolean;
}

export interface EndedAccountSessionSummary {
  id: string;
  label: string | null;
  lastActivityPath: string | null;
  lastActivityLabel: string | null;
  endedAt: string;
  endedReason: string;
}

export interface UserWorkspaceSummary {
  workspaceId: string;
  syncedBookCount: number;
  lastSyncedAt: string | null;
  latestBookId: string | null;
  latestBookTitle: string | null;
  latestBookCoverTheme: string | null;
  latestBookCoverLabel: string | null;
  latestBookCoverGlyph: string | null;
  latestBookGenreLabel: string | null;
  latestPlayableArtifactKind: GenerationJobKind | null;
  latestSessionBookId: string | null;
  latestSessionBookTitle: string | null;
  latestSessionChapterIndex: number | null;
  latestSessionProgressSeconds: number | null;
  latestSessionArtifactKind: GenerationJobKind | null;
  latestSessionUpdatedAt: string | null;
  latestResumePath: string | null;
  isCurrent: boolean;
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
  mode: string | null;
  chapterCount: number | null;
  playableArtifactKind: GenerationJobKind | null;
  resumePath: string | null;
}

export type GenerationJobKind = "sample-generation" | "full-book-generation";

export interface GenerationOutputSummary {
  workspaceId: string;
  bookId: string;
  kind: GenerationJobKind;
  narratorId: string | null;
  mode: string | null;
  chapterCount: number | null;
  assetPath: string;
  mimeType: string;
  provider: "openai" | "mock";
  generatedAt: string;
}

export interface GenerationArtifactSummary extends GenerationOutputSummary {
  id: string;
  jobId: string;
}

export interface SyncedBookDisplayMeta {
  bookId: string;
  title: string;
  coverTheme: string | null;
  coverLabel: string | null;
  coverGlyph: string | null;
  genreLabel: string | null;
}
