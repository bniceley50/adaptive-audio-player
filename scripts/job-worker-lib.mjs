import { parseChapters } from "../src/lib/parser/parse-chapters.ts";

const maxTtsChunkCharacters = 18_000;
const maxChatterboxChunkCharacters = 900;
const maxSampleCharacters = 1_000;

class JobStoppedError extends Error {
  constructor(status) {
    super(`Generation job stopped before completion (${status ?? "missing"}).`);
    this.status = status ?? null;
  }
}

function getDraftTextForJob(job, getSyncedBookDraftText) {
  const draftText = getSyncedBookDraftText(job.workspaceId, job.bookId);
  if (!draftText) {
    throw new Error(`No synced draft found for ${job.bookId}.`);
  }

  return draftText;
}

function buildSampleGenerationText(job, getSyncedBookDraftText) {
  const draftText = getDraftTextForJob(job, getSyncedBookDraftText);
  const chapters = parseChapters(draftText);
  const sampleChapter = chapters[0];
  const maximumCharacters =
    job.engineId === "chatterbox"
      ? maxChatterboxChunkCharacters
      : maxSampleCharacters;
  return sampleChapter
    ? `${sampleChapter.title}\n\n${sampleChapter.text}`.slice(0, maximumCharacters)
    : draftText.slice(0, maximumCharacters);
}

function buildChapterRenderPlan(job, getSyncedBookDraftText) {
  const draftText = getDraftTextForJob(job, getSyncedBookDraftText);
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

function splitOversizedText(text, maximumCharacters) {
  const parts = [];
  let remaining = text.trim();
  while (remaining.length > maximumCharacters) {
    const candidate = remaining.slice(0, maximumCharacters + 1);
    const boundary = Math.max(
      candidate.lastIndexOf(" "),
      candidate.lastIndexOf("\n"),
    );
    const splitAt = boundary > 0 ? boundary : maximumCharacters;
    parts.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) {
    parts.push(remaining);
  }
  return parts;
}

export function splitTextForTts(text, maximumCharacters = maxTtsChunkCharacters) {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return [];
  }

  if (trimmedText.length <= maximumCharacters) {
    return [trimmedText];
  }

  const chunks = [];
  const paragraphs = trimmedText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > maximumCharacters) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = "";
      }

      const sentences =
        paragraph.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((sentence) => sentence.trim()) ??
        [paragraph];
      for (const sentence of sentences) {
        for (const part of splitOversizedText(sentence, maximumCharacters)) {
          const previous = chunks.at(-1);
          if (previous && `${previous} ${part}`.length <= maximumCharacters) {
            chunks[chunks.length - 1] = `${previous} ${part}`;
          } else {
            chunks.push(part);
          }
        }
      }
      continue;
    }

    const nextChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
    if (nextChunk.length > maximumCharacters) {
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

function getRunningJobOrStop(job, getGenerationJob) {
  const refreshedJob = getGenerationJob(job.id, job.workspaceId);
  if (!refreshedJob || refreshedJob.status !== "running") {
    throw new JobStoppedError(refreshedJob?.status);
  }

  return refreshedJob;
}

async function synthesizeChapterAudio(job, chapter, dependencies) {
  const chunks = splitTextForTts(
    chapter.text,
    job.engineId === "chatterbox"
      ? maxChatterboxChunkCharacters
      : maxTtsChunkCharacters,
  );
  if (chunks.length === 0) {
    throw new Error(`Chapter ${chapter.index + 1} has no text to render.`);
  }

  const synthesizedChunks = [];
  for (const chunk of chunks) {
    getRunningJobOrStop(job, dependencies.getGenerationJob);
    const synthesizedChunk = await dependencies.synthesizeAudio({
      text: chunk,
      narratorId: job.narratorId,
      mode: job.mode,
      engineId: job.engineId,
    });
    getRunningJobOrStop(job, dependencies.getGenerationJob);
    synthesizedChunks.push(synthesizedChunk);
  }

  const firstChunk = synthesizedChunks[0];
  if (!firstChunk) {
    throw new Error(`Chapter ${chapter.index + 1} did not return audio.`);
  }

  return {
    data:
      synthesizedChunks.length === 1
        ? firstChunk.data
        : dependencies.stitchWavAudioAssets(
            synthesizedChunks.map((chunk) => chunk.data),
          ),
    mimeType: firstChunk.mimeType,
    extension: firstChunk.extension,
    provider: firstChunk.provider,
  };
}

async function renderSample(job, dependencies, unpublishedAssetPaths) {
  const text = buildSampleGenerationText(job, dependencies.getSyncedBookDraftText);
  const synthesizedAudio = await synthesizeChapterAudio(
    job,
    { index: 0, text },
    dependencies,
  );

  const asset = dependencies.writeGeneratedAudioAsset({
    workspaceId: job.workspaceId,
    bookId: job.bookId,
    kind: job.kind,
    extension: synthesizedAudio.extension,
    data: synthesizedAudio.data,
    label: `${job.id}-sample`,
  });
  unpublishedAssetPaths.push(asset.relativePath);

  return {
    assetPath: asset.relativePath,
    mimeType: synthesizedAudio.mimeType,
    provider: synthesizedAudio.provider,
  };
}

async function renderFullBook(
  job,
  dependencies,
  unpublishedAssetPaths,
  temporaryPartPaths,
) {
  const chapters = buildChapterRenderPlan(job, dependencies.getSyncedBookDraftText);
  const chapterPartPaths = [];
  let provider = null;

  dependencies.updateGenerationJobProgress(job.id, job.workspaceId, {
    totalChapters: chapters.length,
    completedChapters: 0,
    currentChapterIndex: null,
    currentChapterTitle: null,
  });

  for (const chapter of chapters) {
    getRunningJobOrStop(job, dependencies.getGenerationJob);
    dependencies.updateGenerationJobProgress(job.id, job.workspaceId, {
      totalChapters: chapters.length,
      completedChapters: chapter.index,
      currentChapterIndex: chapter.index,
      currentChapterTitle: chapter.title,
    });

    const synthesizedAudio = await synthesizeChapterAudio(job, chapter, dependencies);
    getRunningJobOrStop(job, dependencies.getGenerationJob);

    const chapterPart = dependencies.writeGeneratedAudioPart({
      workspaceId: job.workspaceId,
      bookId: job.bookId,
      kind: job.kind,
      extension: synthesizedAudio.extension,
      data: synthesizedAudio.data,
      label: `${job.id}-chapter-${chapter.index + 1}`,
    });
    temporaryPartPaths.push(chapterPart.relativePath);
    chapterPartPaths.push(chapterPart.relativePath);
    provider ??= synthesizedAudio.provider;

    dependencies.updateGenerationJobProgress(job.id, job.workspaceId, {
      totalChapters: chapters.length,
      completedChapters: chapter.index + 1,
      currentChapterIndex: chapter.index,
      currentChapterTitle: chapter.title,
    });
  }

  getRunningJobOrStop(job, dependencies.getGenerationJob);
  const fullBookAsset = dependencies.assembleGeneratedWavParts({
    workspaceId: job.workspaceId,
    bookId: job.bookId,
    kind: job.kind,
    partPaths: chapterPartPaths,
    label: `${job.id}-stitched-full-book`,
  });
  temporaryPartPaths.length = 0;
  unpublishedAssetPaths.push(fullBookAsset.relativePath);
  getRunningJobOrStop(job, dependencies.getGenerationJob);

  if (fullBookAsset.partDurationsSeconds.length !== chapters.length) {
    throw new Error("Generated chapter timing metadata is incomplete.");
  }
  let chapterStartSeconds = 0;
  const chapterTimings = chapters.map((chapter, index) => {
    const durationSeconds = fullBookAsset.partDurationsSeconds[index];
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error(`Chapter ${index + 1} has an invalid generated duration.`);
    }
    const timing = {
      chapterIndex: chapter.index,
      chapterTitle: chapter.title,
      startSeconds: chapterStartSeconds,
      durationSeconds,
    };
    chapterStartSeconds += durationSeconds;
    return timing;
  });

  return {
    assetPath: fullBookAsset.relativePath,
    chapterTimings,
    mimeType: "audio/wav",
    provider:
      provider ??
      (job.engineId === "chatterbox" ? "chatterbox-local" : "kokoro-local"),
  };
}

export async function executeGenerationJob(job, dependencies) {
  const unpublishedAssetPaths = [];
  const temporaryPartPaths = [];
  let published = false;

  try {
    getRunningJobOrStop(job, dependencies.getGenerationJob);
    const outputAsset =
      job.kind === "full-book-generation"
        ? await renderFullBook(
            job,
            dependencies,
            unpublishedAssetPaths,
            temporaryPartPaths,
          )
        : await renderSample(job, dependencies, unpublishedAssetPaths);

    getRunningJobOrStop(job, dependencies.getGenerationJob);
    const completion = dependencies.completeGenerationJob(
      job.id,
      job.workspaceId,
      outputAsset,
    );
    if (!completion.ok) {
      throw new JobStoppedError(completion.currentStatus);
    }

    published = true;
    return {
      status: "completed",
      currentStatus: completion.job.status,
    };
  } catch (error) {
    if (error instanceof JobStoppedError) {
      return {
        status: "stopped",
        currentStatus: error.status,
      };
    }

    throw error;
  } finally {
    let cleanupError = null;
    for (const partPath of temporaryPartPaths.reverse()) {
      try {
        dependencies.deleteGeneratedAudioPart(partPath);
      } catch (error) {
        cleanupError ??= error;
      }
    }

    if (!published) {
      for (const assetPath of unpublishedAssetPaths.reverse()) {
        try {
          dependencies.deleteGeneratedAudioAsset(assetPath);
        } catch (error) {
          cleanupError ??= error;
        }
      }
    }

    if (cleanupError) {
      throw cleanupError;
    }
  }
}
