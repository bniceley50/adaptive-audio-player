import type {
  GenerationOutputSummary,
  LibrarySyncSnapshot,
  UserAccountSessionSummary,
  UserWorkspaceSummary,
} from "@/lib/backend/types";
import type {
  LocalLibraryBook,
  LocalListeningProfile,
  LocalSampleRequest,
  RemovedLocalLibraryBook,
  ResolvedListeningTaste,
} from "@/lib/library/local-library";
import type {
  PersistedPlaybackState,
  PlaybackDefaults,
} from "@/lib/playback/local-playback";

export interface LibraryRepository {
  listBooks(): Promise<LocalLibraryBook[]>;
  getBook(bookId: string): Promise<LocalLibraryBook | null>;
  saveBook(book: LocalLibraryBook): Promise<void>;
  removeBook(bookId: string): Promise<void>;
  listRemovedBooks(): Promise<RemovedLocalLibraryBook[]>;
  restoreRemovedBook(bookId: string): Promise<void>;
}

export interface ListeningTasteRepository {
  resolveTaste(bookId: string): Promise<ResolvedListeningTaste>;
  saveBookTaste(profile: LocalListeningProfile): Promise<void>;
  readDefaultTaste(): Promise<LocalListeningProfile | null>;
  saveDefaultTaste(profile: LocalListeningProfile): Promise<void>;
  clearDefaultTaste(): Promise<void>;
  readSampleRequest(): Promise<LocalSampleRequest | null>;
  saveSampleRequest(request: LocalSampleRequest): Promise<void>;
}

export interface PlaybackRepository {
  readPlaybackState(bookId: string): Promise<PersistedPlaybackState | null>;
  writePlaybackState(
    bookId: string,
    state: PersistedPlaybackState,
  ): Promise<void>;
  clearPlaybackState(bookId: string): Promise<void>;
  readPlaybackDefaults(): Promise<PlaybackDefaults | null>;
  writePlaybackDefaults(defaults: PlaybackDefaults): Promise<void>;
}

export interface GenerationRepository {
  listOutputs(bookId: string): Promise<GenerationOutputSummary[]>;
  readCurrentOutput(
    bookId: string,
    kind: "sample-generation" | "full-book-generation",
  ): Promise<GenerationOutputSummary | null>;
}

export interface WorkspaceSnapshotRepository {
  readSnapshot(): Promise<LibrarySyncSnapshot | null>;
  writeSnapshot(snapshot: LibrarySyncSnapshot): Promise<void>;
}

export interface AccountSessionService {
  listActiveSessions(): Promise<UserAccountSessionSummary[]>;
  listLinkedWorkspaces(): Promise<UserWorkspaceSummary[]>;
  revokeSession(sessionId: string): Promise<void>;
  revokeOtherSessions(): Promise<void>;
}
