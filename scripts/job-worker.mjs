import { getWorkerConfig } from "../src/lib/backend/env.ts";
import {
  claimNextGenerationJob,
  completeGenerationJob,
  failGenerationJob,
  getGenerationJob,
  getSyncedBookDraftText,
  recordWorkerHeartbeat,
  renewGenerationJobLease,
  updateGenerationJobProgress,
} from "../src/lib/backend/sqlite.ts";
import {
  assembleGeneratedWavParts,
  deleteGeneratedAudioAsset,
  deleteGeneratedAudioPart,
  stitchWavAudioAssets,
  writeGeneratedAudioAsset,
  writeGeneratedAudioPart,
} from "../src/lib/backend/audio-storage.ts";
import { synthesizeAudio } from "../src/lib/backend/tts.ts";
import { executeGenerationJob } from "./job-worker-lib.mjs";

const { pollMs, sampleJobDurationMs, fullBookJobDurationMs } = getWorkerConfig();
const workerName = "generation-worker";
const workerReadyMessageType = "adaptive-audio-player-worker-ready";
const workerReadyPrefix = "AAP_WORKER_READY ";
const generationJobHeartbeatMs = 10_000;

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

function startGenerationJobLeaseHeartbeat(job) {
  let heartbeat = null;
  const stopHeartbeat = () => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  heartbeat = setInterval(() => {
    try {
      const renewedJob = renewGenerationJobLease(job.id, job.workspaceId);
      if (!renewedJob) {
        stopHeartbeat();
      }
    } catch (error) {
      console.error("[worker] failed to renew job lease", job.id, error);
    }
  }, generationJobHeartbeatMs);
  heartbeat.unref();

  return stopHeartbeat;
}

const jobExecutionDependencies = {
  assembleGeneratedWavParts,
  completeGenerationJob,
  deleteGeneratedAudioAsset,
  deleteGeneratedAudioPart,
  getGenerationJob,
  getSyncedBookDraftText,
  stitchWavAudioAssets,
  synthesizeAudio,
  updateGenerationJobProgress,
  writeGeneratedAudioAsset,
  writeGeneratedAudioPart,
};

async function runWorkerLoop() {
  recordWorkerHeartbeat({
    workerName,
    status: "idle",
  });
  const readyMessage = {
    type: workerReadyMessageType,
    protocolVersion: 1,
    workerName,
  };
  process.stdout.write(`${workerReadyPrefix}${JSON.stringify(readyMessage)}\n`);
  process.send?.(readyMessage);

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

    let stopLeaseHeartbeat = null;
    try {
      recordWorkerHeartbeat({
        workerName,
        status: "processing",
        lastJobId: job.id,
        lastJobKind: job.kind,
        lastJobStatus: "running",
      });
      stopLeaseHeartbeat = startGenerationJobLeaseHeartbeat(job);
      await sleep(resolveJobDuration(job));

      if (stopping) {
        break;
      }

      const result = await executeGenerationJob(job, jobExecutionDependencies);
      recordWorkerHeartbeat({
        workerName,
        status: "idle",
        lastJobId: job.id,
        lastJobKind: job.kind,
        lastJobStatus: result.status === "completed" ? "completed" : null,
      });
    } catch (error) {
      console.error("[worker] failed job", job.id, error);
      const currentJob = getGenerationJob(job.id, job.workspaceId);
      if (currentJob?.status === "running") {
        failGenerationJob(
          job.id,
          job.workspaceId,
          error instanceof Error ? error.message : "Unknown worker failure.",
        );
      }
      recordWorkerHeartbeat({
        workerName,
        status: "idle",
        lastJobId: job.id,
        lastJobKind: job.kind,
        lastJobStatus: currentJob?.status === "cancelled" ? null : "failed",
      });
    } finally {
      stopLeaseHeartbeat?.();
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
