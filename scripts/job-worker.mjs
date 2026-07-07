import { getWorkerConfig } from "../src/lib/backend/env.ts";
import {
  claimNextGenerationJob,
  completeGenerationJob,
  failGenerationJob,
  getGenerationJob,
  getSyncedBookDraftText,
  recordWorkerHeartbeat,
  updateGenerationJobProgress,
} from "../src/lib/backend/sqlite.ts";
import {
  deleteGeneratedAudioAsset,
  stitchWavAudioAssets,
  writeGeneratedAudioAsset,
} from "../src/lib/backend/audio-storage.ts";
import { synthesizeAudio } from "../src/lib/backend/tts.ts";
import { parseChapters } from "../src/lib/parser/parse-chapters.ts";

const { pollMs, sampleJobDurationMs, fullBookJobDurationMs } = getWorkerConfig();
const workerName = "generation-worker";
const maxTtsChunkCharacters = 18_000;

let stopping = false;

class JobStoppedError extends Error {
  constructor(status) {
    super(`Generation job stopped before completion (${status ?? "missing"}).`);
    this.status = status ?? null;
  }
}

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

function getDraftTextForJob(job) {
  const draftText = getSyncedBookDraftText(job.workspaceId, job.bookId);
  if (!draftText) {
    throw new Error(`No synced draft found for ${job.bookId}.`);
  }

  return draftText;
}

function buildSampleGenerationText(job) {
  const draftText = getDraftTextForJob(job);
  const chapters = parseChapters(draftText);
  const sampleChapter = chapters[0];
  return sampleChapter
    ? `${sampleChapter.title}\n\n${sampleChapter.text}`.slice(0, maxTtsChunkCharacters)
    : draftText.slice(0, maxTtsChunkCharacters);
}

function buildChapterRenderPlan(job) {
  const draftText = getDraftTextForJob(job);
  const chapters = parseChapters(draftText);
  const renderChapters =
    chapters.length > 0
      ? chapters
      : [
          {
            id: "chapter-1",
            order: 0,
            title: "Chapter 1",
            text: draftText,
          },
        ];

  return renderChapters.map((chapter, index) => {
    const title = chapter.title?.trim() || `Chapter ${index + 1}`;
    const text = `${title}\n\n${chapter.text ?? ""}`.trim();

    return {
      index,
      title,
      text: text || title,
    };
  });
}

function splitTextForTts(text) {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return [];
  }

  if (trimmedText.length <= maxTtsChunkCharacters) {
    return [trimmedText];
  }

  const chunks = [];
  const paragraphs = trimmedText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxTtsChunkCharacters) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = "";
      }

      for (let index = 0; index < paragraph.length; index += maxTtsChunkCharacters) {
        chunks.push(paragraph.slice(index, index + maxTtsChunkCharacters));
      }
      continue;
    }

    const nextChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
    if (nextChunk.length > maxTtsChunkCharacters) {
      chunks.push(currentChunk);
      currentChunk = paragraph;
    } else {
      currentChunk = nextChunk;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function getRunningJobOrStop(job) {
  const refreshedJob = getGenerationJob(job.id, job.workspaceId);
  if (!refreshedJob || refreshedJob.status !== "running") {
    throw new JobStoppedError(refreshedJob?.status);
  }

  return refreshedJob;
}

async function synthesizeChapterAudio(job, chapter) {
  const chunks = splitTextForTts(chapter.text);
  if (chunks.length === 0) {
    throw new Error(`Chapter ${chapter.index + 1} has no text to render.`);
  }

  const synthesizedChunks = [];
  for (const chunk of chunks) {
    getRunningJobOrStop(job);
    synthesizedChunks.push(
      await synthesizeAudio({
        text: chunk,
        narratorId: job.narratorId,
        mode: job.mode,
      }),
    );
  }

  const firstChunk = synthesizedChunks[0];
  if (!firstChunk) {
    throw new Error(`Chapter ${chapter.index + 1} did not return audio.`);
  }

  return {
    data:
      synthesizedChunks.length === 1
        ? firstChunk.data
        : stitchWavAudioAssets(synthesizedChunks.map((chunk) => chunk.data)),
    mimeType: firstChunk.mimeType,
    extension: firstChunk.extension,
    provider: firstChunk.provider,
  };
}

async function renderFullBookByChapter(job) {
  const chapters = buildChapterRenderPlan(job);
  const writtenAssets = [];
  const chapterArtifacts = [];
  const chapterAudioBuffers = [];

  try {
    updateGenerationJobProgress(job.id, job.workspaceId, {
      totalChapters: chapters.length,
      completedChapters: 0,
      currentChapterIndex: null,
      currentChapterTitle: null,
    });

    for (const chapter of chapters) {
      getRunningJobOrStop(job);
      updateGenerationJobProgress(job.id, job.workspaceId, {
        totalChapters: chapters.length,
        completedChapters: chapter.index,
        currentChapterIndex: chapter.index,
        currentChapterTitle: chapter.title,
      });

      const synthesizedAudio = await synthesizeChapterAudio(job, chapter);
      getRunningJobOrStop(job);

      const chapterAsset = writeGeneratedAudioAsset({
        workspaceId: job.workspaceId,
        bookId: job.bookId,
        kind: job.kind,
        extension: synthesizedAudio.extension,
        data: synthesizedAudio.data,
        label: `${job.id}-chapter-${chapter.index + 1}`,
      });
      writtenAssets.push(chapterAsset.relativePath);
      chapterAudioBuffers.push(synthesizedAudio.data);
      chapterArtifacts.push({
        assetPath: chapterAsset.relativePath,
        mimeType: synthesizedAudio.mimeType,
        provider: synthesizedAudio.provider,
        chapterIndex: chapter.index,
        chapterTitle: chapter.title,
      });

      updateGenerationJobProgress(job.id, job.workspaceId, {
        totalChapters: chapters.length,
        completedChapters: chapter.index + 1,
        currentChapterIndex: chapter.index,
        currentChapterTitle: chapter.title,
      });
    }

    getRunningJobOrStop(job);
    const fullBookAudio = stitchWavAudioAssets(chapterAudioBuffers);
    const fullBookAsset = writeGeneratedAudioAsset({
      workspaceId: job.workspaceId,
      bookId: job.bookId,
      kind: job.kind,
      extension: "wav",
      data: fullBookAudio,
      label: `${job.id}-stitched-full-book`,
    });
    writtenAssets.push(fullBookAsset.relativePath);

    completeGenerationJob(job.id, job.workspaceId, {
      assetPath: fullBookAsset.relativePath,
      mimeType: "audio/wav",
      provider: chapterArtifacts[0]?.provider ?? "kokoro-local",
      chapterAssetPaths: chapterArtifacts.map((artifact) => artifact.assetPath),
      chapterArtifacts,
    });

    return "completed";
  } catch (error) {
    for (const assetPath of writtenAssets) {
      deleteGeneratedAudioAsset(assetPath);
    }

    if (error instanceof JobStoppedError) {
      return "stopped";
    }

    throw error;
  }
}

async function runWorkerLoop() {
  recordWorkerHeartbeat({
    workerName,
    status: "idle",
  });

  while (!stopping) {
    let job = null;

    try {
      recordWorkerHeartbeat({
        workerName,
        status: "idle",
      });
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
      recordWorkerHeartbeat({
        workerName,
        status: "processing",
        lastJobId: job.id,
        lastJobKind: job.kind,
        lastJobStatus: "running",
      });
      await sleep(resolveJobDuration(job));

      const refreshedJob = getGenerationJob(job.id, job.workspaceId);
      if (!refreshedJob || refreshedJob.status !== "running") {
        recordWorkerHeartbeat({
          workerName,
          status: "idle",
          lastJobId: job.id,
          lastJobKind: job.kind,
          lastJobStatus: null,
        });
        continue;
      }

      if (stopping) {
        break;
      }

      if (job.kind === "full-book-generation") {
        const result = await renderFullBookByChapter(job);
        recordWorkerHeartbeat({
          workerName,
          status: "idle",
          lastJobId: job.id,
          lastJobKind: job.kind,
          lastJobStatus: result === "completed" ? "completed" : null,
        });
        continue;
      }

      const synthesizedAudio = await synthesizeAudio({
        text: buildSampleGenerationText(job),
        narratorId: job.narratorId,
        mode: job.mode,
      });
      const asset = writeGeneratedAudioAsset({
        workspaceId: job.workspaceId,
        bookId: job.bookId,
        kind: job.kind,
        extension: synthesizedAudio.extension,
        data: synthesizedAudio.data,
        label: `${job.id}-sample`,
      });

      completeGenerationJob(job.id, job.workspaceId, {
        assetPath: asset.relativePath,
        mimeType: synthesizedAudio.mimeType,
        provider: synthesizedAudio.provider,
      });
      recordWorkerHeartbeat({
        workerName,
        status: "idle",
        lastJobId: job.id,
        lastJobKind: job.kind,
        lastJobStatus: "completed",
      });
    } catch (error) {
      console.error("[worker] failed job", job.id, error);
      failGenerationJob(
        job.id,
        job.workspaceId,
        error instanceof Error ? error.message : "Unknown worker failure.",
      );
      recordWorkerHeartbeat({
        workerName,
        status: "idle",
        lastJobId: job.id,
        lastJobKind: job.kind,
        lastJobStatus: "failed",
      });
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
    recordWorkerHeartbeat({
      workerName,
      status: "stopped",
    });
  });
}

runWorkerLoop().catch((error) => {
  console.error("[worker] fatal error", error);
  process.exitCode = 1;
});
