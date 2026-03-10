import type { LibrarySyncSnapshot } from "@/lib/backend/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readNullableNumber(value: unknown): number | null {
  if (value === null) {
    return null;
  }

  return readNumber(value);
}

export function parseLibrarySyncSnapshot(
  input: unknown,
): LibrarySyncSnapshot | null {
  if (!isRecord(input)) {
    return null;
  }

  const syncedAt = readString(input.syncedAt);
  if (!syncedAt) {
    return null;
  }

  const libraryBooks = Array.isArray(input.libraryBooks)
    ? input.libraryBooks
        .map((book) => {
          if (!isRecord(book)) {
            return null;
          }

          const bookId = readString(book.bookId);
          const title = readString(book.title);
          const chapterCount = readNumber(book.chapterCount);
          const updatedAt = readString(book.updatedAt);
          const coverTheme = readString(book.coverTheme);
          const coverLabel = readString(book.coverLabel);
          const coverGlyph = readString(book.coverGlyph);
          const genreLabel = readString(book.genreLabel);

          if (!bookId || !title || chapterCount === null || !updatedAt) {
            return null;
          }

          return {
            bookId,
            title,
            chapterCount,
            updatedAt,
            coverTheme: coverTheme ?? undefined,
            coverLabel: coverLabel ?? undefined,
            coverGlyph: coverGlyph ?? undefined,
            genreLabel: genreLabel ?? undefined,
          };
        })
        .filter((book): book is NonNullable<typeof book> => book !== null)
    : null;

  const draftTexts = Array.isArray(input.draftTexts)
    ? input.draftTexts
        .map((draft) => {
          if (!isRecord(draft)) {
            return null;
          }

          const bookId = readString(draft.bookId);
          const text = readString(draft.text);

          if (!bookId || text === null) {
            return null;
          }

          return {
            bookId,
            text,
          };
        })
        .filter((draft): draft is NonNullable<typeof draft> => draft !== null)
    : null;

  const listeningProfiles = Array.isArray(input.listeningProfiles)
    ? input.listeningProfiles
        .map((profile) => {
          if (!isRecord(profile)) {
            return null;
          }

          const bookId = readString(profile.bookId);
          const narratorId = readString(profile.narratorId);
          const narratorName = readString(profile.narratorName);
          const mode = readString(profile.mode);

          if (!bookId || !narratorId || !narratorName || !mode) {
            return null;
          }

          return {
            bookId,
            narratorId,
            narratorName,
            mode,
          };
        })
        .filter((profile): profile is NonNullable<typeof profile> => profile !== null)
    : null;

  const defaultListeningProfile =
    input.defaultListeningProfile === null
      ? null
      : isRecord(input.defaultListeningProfile)
        ? (() => {
            const bookId = readString(input.defaultListeningProfile.bookId);
            const narratorId = readString(input.defaultListeningProfile.narratorId);
            const narratorName = readString(
              input.defaultListeningProfile.narratorName,
            );
            const mode = readString(input.defaultListeningProfile.mode);

            if (!bookId || !narratorId || !narratorName || !mode) {
              return null;
            }

            return {
              bookId,
              narratorId,
              narratorName,
              mode,
            };
          })()
        : null;

  const sampleRequest =
    input.sampleRequest === null
      ? null
      : isRecord(input.sampleRequest)
        ? (() => {
            const bookId = readString(input.sampleRequest.bookId);
            const narratorId = readString(input.sampleRequest.narratorId);
            const mode = readString(input.sampleRequest.mode);

            if (!bookId || !narratorId || !mode) {
              return null;
            }

            return {
              bookId,
              narratorId,
              mode,
            };
          })()
        : null;

  const playbackStates = Array.isArray(input.playbackStates)
    ? input.playbackStates
        .map((entry) => {
          if (!isRecord(entry) || !isRecord(entry.state)) {
            return null;
          }

          const bookId = readString(entry.bookId);
          const currentChapterIndex = readNumber(entry.state.currentChapterIndex);
          const progressSeconds = readNumber(entry.state.progressSeconds);
          const speed = readNumber(entry.state.speed);
          const sleepTimerMinutes = readNullableNumber(
            entry.state.sleepTimerMinutes,
          );
          const playbackArtifactKind =
            entry.state.playbackArtifactKind === "sample-generation" ||
            entry.state.playbackArtifactKind === "full-book-generation" ||
            entry.state.playbackArtifactKind === null ||
            entry.state.playbackArtifactKind === undefined
              ? (entry.state.playbackArtifactKind as
                  | "sample-generation"
                  | "full-book-generation"
                  | null
                  | undefined)
              : null;
          const updatedAt = readString(entry.state.updatedAt) ?? null;
          const isBookmarked =
            typeof entry.state.isBookmarked === "boolean"
              ? entry.state.isBookmarked
              : false;
          const bookmarks = Array.isArray(entry.state.bookmarks)
            ? entry.state.bookmarks
                .map((bookmark) => {
                  if (!isRecord(bookmark)) {
                    return null;
                  }

                  const id = readString(bookmark.id);
                  const chapterIndex = readNumber(bookmark.chapterIndex);
                  const progressSecondsValue = readNumber(
                    bookmark.progressSeconds,
                  );
                  const createdAt = readString(bookmark.createdAt);

                  if (
                    !id ||
                    chapterIndex === null ||
                    progressSecondsValue === null ||
                    !createdAt
                  ) {
                    return null;
                  }

                  return {
                    id,
                    chapterIndex,
                    progressSeconds: progressSecondsValue,
                    createdAt,
                  };
                })
                .filter(
                  (bookmark): bookmark is NonNullable<typeof bookmark> =>
                    bookmark !== null,
                )
            : [];

          if (
            !bookId ||
            currentChapterIndex === null ||
            progressSeconds === null ||
            speed === null
          ) {
            return null;
          }

          return {
            bookId,
            state: {
              currentChapterIndex,
              progressSeconds,
              speed,
              isBookmarked,
              sleepTimerMinutes,
              playbackArtifactKind: playbackArtifactKind ?? undefined,
              updatedAt: updatedAt ?? undefined,
              bookmarks,
            },
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : null;

  const playbackDefaults =
    input.playbackDefaults === null
      ? null
      : isRecord(input.playbackDefaults)
        ? (() => {
            const speed = readNumber(input.playbackDefaults.speed);
            const sleepTimerMinutes = readNullableNumber(
              input.playbackDefaults.sleepTimerMinutes,
            );

            if (speed === null) {
              return null;
            }

            return {
              speed,
              sleepTimerMinutes,
            };
          })()
        : null;

  if (
    !libraryBooks ||
    !draftTexts ||
    !listeningProfiles ||
    playbackStates === null ||
    playbackDefaults === undefined
  ) {
    return null;
  }

  return {
    libraryBooks,
    draftTexts,
    listeningProfiles,
    defaultListeningProfile,
    sampleRequest,
    playbackStates,
    playbackDefaults,
    generationOutputs: [],
    syncedAt,
  };
}
