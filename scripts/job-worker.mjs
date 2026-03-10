import {
  claimNextGenerationJob,
  completeGenerationJob,
  failGenerationJob,
  getSyncedBookDraftText,
} from "../src/lib/backend/sqlite.ts";
import { writeGeneratedAudioAsset } from "../src/lib/backend/audio-storage.ts";
import { synthesizeAudio } from "../src/lib/backend/tts.ts";
import { parseChapters } from "../src/lib/parser/parse-chapters.ts";

const pollMs = Number(process.env.ADAPTIVE_AUDIO_PLAYER_WORKER_POLL_MS ?? 150);
const sampleJobDurationMs = Number(
  process.env.ADAPTIVE_AUDIO_PLAYER_SAMPLE_JOB_DURATION_MS ?? 350,
);
const fullBookJobDurationMs = Number(
  process.env.ADAPTIVE_AUDIO_PLAYER_FULL_BOOK_JOB_DURATION_MS ?? 550,
);

let stopping = false;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolveJobDuration(job) {
  return job.kind === "full-book-generation"
    ? fullBookJobDurationMs
    : sampleJobDurationMs;
}

function buildGenerationText(job) {
  const draftText = getSyncedBookDraftText(job.workspaceId, job.bookId);
  if (!draftText) {
    throw new Error(`No synced draft found for ${job.bookId}.`);
  }

  const chapters = parseChapters(draftText);
  if (job.kind === "sample-generation") {
    const sampleChapter = chapters[0];
    return sampleChapter
      ? `${sampleChapter.title}\n\n${sampleChapter.text}`
      : draftText.slice(0, 4000);
  }

  const stitchedDraft = chapters
    .slice(0, 4)
    .map((chapter) => `${chapter.title}\n\n${chapter.text}`)
    .join("\n\n");

  return stitchedDraft.slice(0, 4000);
}

async function runWorkerLoop() {
  while (!stopping) {
    let job = null;

    try {
      job = claimNextGenerationJob();
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ERR_SQLITE_ERROR"
      ) {
        await sleep(pollMs);
        continue;
      }

      throw error;
    }

    if (!job) {
      await sleep(pollMs);
      continue;
    }

    try {
      await sleep(resolveJobDuration(job));

      if (stopping) {
        break;
      }

      const synthesizedAudio = await synthesizeAudio({
        text: buildGenerationText(job),
        narratorId: job.narratorId,
        mode: job.mode,
      });
      const asset = writeGeneratedAudioAsset({
        workspaceId: job.workspaceId,
        bookId: job.bookId,
        kind: job.kind,
        extension: synthesizedAudio.extension,
        data: synthesizedAudio.data,
      });

      completeGenerationJob(job.id, job.workspaceId, {
        assetPath: asset.relativePath,
        mimeType: synthesizedAudio.mimeType,
        provider: synthesizedAudio.provider,
      });
    } catch (error) {
      console.error("[worker] failed job", job.id, error);
      failGenerationJob(
        job.id,
        job.workspaceId,
        error instanceof Error ? error.message : "Unknown worker failure.",
      );
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
  });
}

runWorkerLoop().catch((error) => {
  console.error("[worker] fatal error", error);
  process.exitCode = 1;
});
