import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  getChatterboxRuntimeRoot,
  getLocalChatterboxConfig,
} from "@/lib/backend/env";
import {
  FAST_NARRATION_ENGINE_ID,
  HIGH_QUALITY_NARRATION_ENGINE_ID,
  type NarrationEngineStatusPayload,
} from "@/lib/narration/engines";

export const CHATTERBOX_PACKAGE_VERSION = "0.1.7" as const;
export const CHATTERBOX_MODEL_REVISION =
  "5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18" as const;
export const CHATTERBOX_MINIMUM_VRAM_MIB = 8_192;

interface NvidiaCapabilityProbe {
  detected: boolean;
  maximumVramMiB: number | null;
}

interface ChatterboxRuntimeInspection {
  installed: boolean;
}

type ProbeNvidiaCapability = () => Promise<NvidiaCapabilityProbe>;
type InspectChatterboxRuntime = () => Promise<ChatterboxRuntimeInspection>;
type ProbeChatterboxHealth = () => Promise<boolean>;

const requiredModelFiles = [
  "conds.pt",
  "s3gen.safetensors",
  "t3_cfg.safetensors",
  "tokenizer.json",
  "ve.safetensors",
] as const;

export function probeNvidiaCapability(): Promise<NvidiaCapabilityProbe> {
  return new Promise((resolve) => {
    execFile(
      "nvidia-smi",
      ["--query-gpu=memory.total", "--format=csv,noheader,nounits"],
      {
        encoding: "utf8",
        maxBuffer: 16 * 1024,
        timeout: 1_500,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          resolve({ detected: false, maximumVramMiB: null });
          return;
        }

        const values = stdout
          .split(/\r?\n/)
          .map((line) => Number(line.trim()))
          .filter((value) => Number.isFinite(value) && value > 0);
        resolve({
          detected: values.length > 0,
          maximumVramMiB: values.length > 0 ? Math.max(...values) : null,
        });
      },
    );
  });
}

export async function inspectChatterboxRuntime(): Promise<ChatterboxRuntimeInspection> {
  const runtimeRoot = getChatterboxRuntimeRoot();
  const pythonPath = path.join(
    runtimeRoot,
    ".venv",
    process.platform === "win32" ? "Scripts" : "bin",
    process.platform === "win32" ? "python.exe" : "python",
  );

  try {
    const manifest = JSON.parse(
      await readFile(path.join(runtimeRoot, "install-manifest.json"), "utf8"),
    ) as {
      package?: { name?: unknown; version?: unknown };
      model?: { files?: unknown; revision?: unknown };
      runtime?: { python?: unknown; torch?: unknown; torchaudio?: unknown };
      voice?: { id?: unknown; referenceAudioAllowed?: unknown };
    };
    if (
      manifest.package?.name !== "chatterbox-tts" ||
      manifest.package.version !== CHATTERBOX_PACKAGE_VERSION ||
      manifest.model?.revision !== CHATTERBOX_MODEL_REVISION ||
      manifest.runtime?.python !== "3.11" ||
      manifest.runtime.torch !== "2.11.0+cu130" ||
      manifest.runtime.torchaudio !== "2.11.0+cu130" ||
      manifest.voice?.id !== "chatterbox-default" ||
      manifest.voice.referenceAudioAllowed !== false ||
      !manifest.model.files ||
      typeof manifest.model.files !== "object"
    ) {
      return { installed: false };
    }

    const paths = [
      pythonPath,
      ...requiredModelFiles.map((file) => path.join(runtimeRoot, "model", file)),
      path.join(runtimeRoot, "licenses", "Chatterbox-TTS-LICENSE.txt"),
    ];
    const statuses = await Promise.all(paths.map((candidate) => stat(candidate)));
    return {
      installed: statuses.every((status) => status.isFile()),
    };
  } catch {
    return { installed: false };
  }
}

export async function probeChatterboxHealth(): Promise<boolean> {
  let config;
  try {
    config = getLocalChatterboxConfig();
  } catch {
    return false;
  }
  if (!config) {
    return false;
  }

  try {
    const response = await fetch(new URL("/health", config.url), {
      cache: "no-store",
      headers: {
        accept: "application/json",
        "x-adaptive-audio-player-tts-secret": config.secret,
      },
      signal: AbortSignal.timeout(2_000),
    });
    const payload = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    return Boolean(
      response.ok &&
        payload &&
        payload.component === "adaptive-audio-player-chatterbox-tts" &&
        payload.protocolVersion === 1 &&
        payload.ready === true,
    );
  } catch {
    return false;
  }
}

export async function getNarrationEngineStatus(
  options: {
    inspectRuntime?: InspectChatterboxRuntime;
    probeHealth?: ProbeChatterboxHealth;
    probeNvidia?: ProbeNvidiaCapability;
  } = {},
): Promise<NarrationEngineStatusPayload> {
  const capability = await (options.probeNvidia ?? probeNvidiaCapability)();
  const supportedHardware =
    capability.detected &&
    capability.maximumVramMiB !== null &&
    capability.maximumVramMiB >= CHATTERBOX_MINIMUM_VRAM_MIB;

  let highQualityStatus: NarrationEngineStatusPayload["engines"][number];
  if (!supportedHardware) {
    highQualityStatus = {
      id: HIGH_QUALITY_NARRATION_ENGINE_ID,
      availability: "unsupported",
      selectable: false,
      statusMessage:
        "High Quality requires a supported NVIDIA GPU with at least 8 GB of VRAM.",
    };
  } else {
    const runtime = await (
      options.inspectRuntime ?? inspectChatterboxRuntime
    )();
    if (!runtime.installed) {
      highQualityStatus = {
        id: HIGH_QUALITY_NARRATION_ENGINE_ID,
        availability: "not-installed",
        selectable: false,
        statusMessage:
          "Optional setup is not installed. Run pnpm chatterbox:install, then restart the app.",
      };
    } else if (!(await (options.probeHealth ?? probeChatterboxHealth)())) {
      highQualityStatus = {
        id: HIGH_QUALITY_NARRATION_ENGINE_ID,
        availability: "unavailable",
        selectable: false,
        statusMessage:
          "High Quality is installed but its local service is not ready. Restart the app or use Fast / Compatible.",
      };
    } else {
      highQualityStatus = {
        id: HIGH_QUALITY_NARRATION_ENGINE_ID,
        availability: "ready",
        selectable: true,
        statusMessage: "Ready on this machine.",
      };
    }
  }

  return {
    protocolVersion: 1,
    defaultEngineId: FAST_NARRATION_ENGINE_ID,
    engines: [
      {
        id: FAST_NARRATION_ENGINE_ID,
        availability: "ready",
        selectable: true,
        statusMessage: "Ready. This is the reliable local default.",
      },
      highQualityStatus,
    ],
  };
}
