import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import process, { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const nextCliPath = require.resolve("next/dist/bin/next");
const childGuardianPath = path.join(repoRoot, "scripts", "dev-child-guardian.mjs");
const defaultTtsHost = "127.0.0.1";
const chatterboxRuntimeRoot = path.join(repoRoot, "data", "local-chatterbox");
const chatterboxManifestPath = path.join(
  chatterboxRuntimeRoot,
  "install-manifest.json",
);
const appUrl = "http://127.0.0.1:3100";
const pythonProbeTimeoutMs = 30_000;
const healthPollMs = 250;
const children = [];

let shuttingDown = false;
let shutdownPromise = null;
let activeConfig = null;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function unrefDelay(milliseconds) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    timer.unref();
  });
}

async function loadDevelopmentEnvironment() {
  const candidates = [
    ".env.development.local",
    ".env.local",
    ".env.development",
    ".env",
  ];

  for (const candidate of candidates) {
    const envPath = path.join(repoRoot, candidate);
    if (await pathExists(envPath)) {
      loadEnvFile(envPath);
    }
  }
}

function readPositiveInteger(name, fallback, environment = process.env) {
  const rawValue = environment[name];
  if (rawValue === undefined || !rawValue.trim()) {
    return fallback;
  }

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

function readBoolean(name, fallback = false, environment = process.env) {
  const rawValue = environment[name];
  if (rawValue === undefined || !rawValue.trim()) {
    return fallback;
  }

  const value = rawValue.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }

  throw new Error(`${name} must be true or false.`);
}

function isLoopbackHost(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, "").trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized.startsWith("127.")
  );
}

export function readDevelopmentConfig(environment = process.env) {
  const rawTtsUrl = environment.ADAPTIVE_AUDIO_PLAYER_TTS_URL?.trim() || null;
  let ttsHost = defaultTtsHost;
  let ttsPort = null;

  if (rawTtsUrl) {
    let ttsUrl;
    try {
      ttsUrl = new URL(rawTtsUrl);
    } catch {
      throw new Error("ADAPTIVE_AUDIO_PLAYER_TTS_URL must be a valid URL.");
    }

    if (
      ttsUrl.protocol !== "http:" ||
      !isLoopbackHost(ttsUrl.hostname) ||
      ttsUrl.username ||
      ttsUrl.password
    ) {
      throw new Error(
        "ADAPTIVE_AUDIO_PLAYER_TTS_URL must be an http:// loopback URL without credentials.",
      );
    }

    ttsPort = Number(ttsUrl.port || "80");
    if (!Number.isSafeInteger(ttsPort) || ttsPort < 1 || ttsPort > 65_535) {
      throw new Error("ADAPTIVE_AUDIO_PLAYER_TTS_URL must use a valid TCP port.");
    }
    ttsHost = ttsUrl.hostname.replace(/^\[|\]$/g, "");
  }

  return {
    healthTimeoutMs: readPositiveInteger(
      "ADAPTIVE_AUDIO_PLAYER_DEV_HEALTH_TIMEOUT_MS",
      30_000,
      environment,
    ),
    ttsHost,
    ttsOffline: readBoolean(
      "ADAPTIVE_AUDIO_PLAYER_TTS_OFFLINE",
      false,
      environment,
    ),
    ttsPort,
  };
}

function listenAndClose(host, port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ exclusive: true, host, port }, () => {
      const address = server.address();
      const selectedPort =
        address && typeof address === "object" ? address.port : null;
      server.close((error) => {
        if (error) {
          reject(error);
        } else if (!selectedPort) {
          reject(new Error("Loopback port selection returned no port."));
        } else {
          resolve(selectedPort);
        }
      });
    });
  });
}

export async function findAvailableLoopbackPort(host = defaultTtsHost) {
  return listenAndClose(host, 0);
}

export async function assertLoopbackPortAvailable(host, port, label) {
  try {
    await listenAndClose(host, port);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "unavailable";
    const reason =
      code === "EADDRINUSE"
        ? "is already in use"
        : code === "EACCES"
          ? "is reserved or blocked by Windows"
          : "is unavailable";
    throw new Error(`${label} port ${host}:${port} ${reason}.`);
  }
}

function formatLoopbackOrigin(host, port) {
  const formattedHost = host.includes(":") ? `[${host}]` : host;
  return `http://${formattedHost}:${port}`;
}

export async function prepareDevelopmentConfig(
  config,
  {
    assertPortAvailable = assertLoopbackPortAvailable,
    findAvailablePort = findAvailableLoopbackPort,
  } = {},
) {
  const parsedAppUrl = new URL(appUrl);
  const appHost = parsedAppUrl.hostname;
  const appPort = Number(parsedAppUrl.port);
  await assertPortAvailable(appHost, appPort, "Next.js");

  let ttsPort = config.ttsPort;
  if (ttsPort === null) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = await findAvailablePort(config.ttsHost);
      if (candidate !== appPort || config.ttsHost !== appHost) {
        ttsPort = candidate;
        break;
      }
    }
    if (ttsPort === null) {
      throw new Error("Could not select a separate loopback port for local TTS.");
    }
  } else {
    if (ttsPort === appPort && config.ttsHost === appHost) {
      throw new Error("Local TTS and Next.js must use different loopback ports.");
    }
    await assertPortAvailable(config.ttsHost, ttsPort, "Local TTS");
  }

  const ttsOrigin = formatLoopbackOrigin(config.ttsHost, ttsPort);
  return {
    ...config,
    appHost,
    appPort,
    ttsHealthUrl: new URL("/health", ttsOrigin).toString(),
    ttsOrigin,
    ttsPort,
  };
}

export async function waitForLoopbackPortRelease(
  host,
  port,
  timeoutMs,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await listenAndClose(host, port);
      return;
    } catch {
      await delay(healthPollMs);
    }
  }
  throw new Error(`loopback port ${host}:${port} remained in use after shutdown`);
}

function childEnvironment(overrides = {}) {
  const environment = { ...process.env, ...overrides };
  delete environment.NO_COLOR;
  return environment;
}

function formatChildExit(record, code, signal, error) {
  if (error) {
    const errorCode =
      typeof error === "object" && "code" in error ? error.code : "spawn error";
    return `${record.name} could not start (${errorCode})`;
  }
  if (signal) {
    return `${record.name} stopped from ${signal}`;
  }
  return `${record.name} exited with code ${code ?? "unknown"}`;
}

function startChild(
  command,
  args,
  name,
  environmentOverrides = {},
  { required = true } = {},
) {
  const environment = childEnvironment(environmentOverrides);
  const usesGuardian = process.platform === "win32";
  const child = usesGuardian
    ? spawn(process.execPath, [childGuardianPath], {
        cwd: repoRoot,
        env: childEnvironment(),
        stdio: ["pipe", "inherit", "inherit"],
        windowsHide: true,
      })
    : spawn(command, args, {
        cwd: repoRoot,
        detached: true,
        env: environment,
        stdio: "inherit",
      });
  const record = {
    child,
    closed: null,
    handledUnexpectedExit: false,
    name,
    required,
    usesGuardian,
  };

  record.closed = new Promise((resolve) => child.once("close", resolve));
  children.push(record);

  function handleUnexpectedExit(code, signal, error = null) {
    if (shuttingDown || record.handledUnexpectedExit) {
      return;
    }

    record.handledUnexpectedExit = true;
    if (!record.required) {
      console.warn(
        `[dev] ${formatChildExit(record, code, signal, error)}; Fast / Compatible remains available.`,
      );
      return;
    }
    console.error(`[dev] ${formatChildExit(record, code, signal, error)}.`);
    void shutdown(1, `${record.name} is required`);
  }

  child.once("spawn", () => {
    if (usesGuardian) {
      child.stdin.write(
        `${JSON.stringify({
          args,
          command,
          component: name,
          cwd: repoRoot,
          env: environment,
        })}\n`,
      );
      console.log(
        `[dev] started ${name} owner guard (${child.pid ?? "unknown pid"})`,
      );
    } else {
      console.log(`[dev] started ${name} (${child.pid ?? "unknown pid"})`);
    }
  });
  child.stdin?.once("error", (error) =>
    handleUnexpectedExit(null, null, error),
  );
  child.once("error", (error) => handleUnexpectedExit(null, null, error));
  child.once("exit", (code, signal) => handleUnexpectedExit(code, signal));

  return record;
}

function runTaskkill(pid, force) {
  return new Promise((resolve) => {
    const systemRoot = process.env.SystemRoot || "C:\\Windows";
    const args = ["/pid", String(pid), "/t"];
    if (force) {
      args.push("/f");
    }

    const taskkill = spawn(path.join(systemRoot, "System32", "taskkill.exe"), args, {
      cwd: repoRoot,
      stdio: "ignore",
    });
    taskkill.once("error", () => resolve());
    taskkill.once("close", () => resolve());
  });
}

async function terminateChildTree(record, force = false) {
  const pid = record.child.pid;
  if (!pid || !Number.isSafeInteger(pid) || pid <= 0) {
    return;
  }

  if (process.platform === "win32") {
    await runTaskkill(pid, true);
    return;
  }

  try {
    process.kill(-pid, force ? "SIGKILL" : "SIGTERM");
  } catch (error) {
    if (!error || typeof error !== "object" || error.code !== "ESRCH") {
      throw error;
    }
  }
}

async function shutdown(exitCode, reason) {
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shuttingDown = true;
  console.log(`[dev] stopping local runtime (${reason})`);

  shutdownPromise = (async () => {
    await Promise.all(children.map((record) => terminateChildTree(record)));

    const shutdownTimeoutMs = readPositiveInteger(
      "ADAPTIVE_AUDIO_PLAYER_DEV_SHUTDOWN_TIMEOUT_MS",
      5_000,
    );
    await Promise.race([
      Promise.all(children.map((record) => record.closed)),
      unrefDelay(shutdownTimeoutMs),
    ]);

    for (const record of children) {
      if (record.child.exitCode === null && record.child.signalCode === null) {
        console.error(`[dev] force-stopping ${record.name} after timeout.`);
        await terminateChildTree(record, true);
      }
    }

    await Promise.race([
      Promise.all(children.map((record) => record.closed)),
      unrefDelay(shutdownTimeoutMs),
    ]);

    if (activeConfig) {
      const ownedPorts = [
        ["Next.js", activeConfig.appHost, activeConfig.appPort],
        ["local TTS", activeConfig.ttsHost, activeConfig.ttsPort],
      ];
      if (activeConfig.chatterboxPort) {
        ownedPorts.push([
          "High Quality TTS",
          activeConfig.chatterboxHost,
          activeConfig.chatterboxPort,
        ]);
      }
      for (const [label, host, port] of ownedPorts) {
        try {
          await waitForLoopbackPortRelease(host, port, shutdownTimeoutMs);
        } catch {
          process.exitCode = 1;
          console.error(`[dev] ${label} port did not release after shutdown.`);
        }
      }
    }

    if (process.connected) {
      process.disconnect();
    }
  })();

  return shutdownPromise;
}

function runCaptured(command, args, timeoutMs, environmentOverrides = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: childEnvironment(environmentOverrides),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ code: null, error: new Error("probe timed out"), stderr, stdout });
    }, timeoutMs);

    function appendBounded(current, chunk) {
      return `${current}${chunk}`.slice(-8_192);
    }

    function finish(result) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(result);
    }

    child.stdout.on("data", (chunk) => {
      stdout = appendBounded(stdout, chunk.toString());
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendBounded(stderr, chunk.toString());
    });
    child.once("error", (error) => finish({ code: null, error, stderr, stdout }));
    child.once("close", (code) => finish({ code, error: null, stderr, stdout }));
  });
}

const pythonProbe = String.raw`
import importlib
import importlib.metadata
import sys

try:
    if sys.version_info[:2] != (3, 12):
        raise RuntimeError(f"Python 3.12 is required; found {sys.version.split()[0]}")

    expected = {
        "fastapi": "0.139.0",
        "uvicorn": "0.50.2",
        "kokoro": "0.9.4",
        "huggingface-hub": "1.22.0",
        "numpy": "2.5.1",
        "soundfile": "0.14.0",
        "en-core-web-sm": "3.8.0",
    }
    for package, version in expected.items():
        actual = importlib.metadata.version(package)
        if actual != version:
            raise RuntimeError(f"{package} must be {version}; found {actual}")

    for module in ("fastapi", "uvicorn", "kokoro", "huggingface_hub", "numpy", "soundfile", "en_core_web_sm"):
        importlib.import_module(module)
except Exception as error:
    print(f"AAP_PYTHON_ERROR:{type(error).__name__}: {error}", file=sys.stderr)
    sys.exit(1)

print(f"AAP_PYTHON_READY:{sys.executable}")
`;

function lastUsefulLine(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
}

async function pathExists(candidatePath) {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function pythonCandidates() {
  const configured = process.env.ADAPTIVE_AUDIO_PLAYER_PYTHON?.trim();
  if (configured) {
    return [{ command: configured, label: "ADAPTIVE_AUDIO_PLAYER_PYTHON" }];
  }

  const candidates = [];
  const pathCandidates = [];
  const virtualEnvironment = process.env.VIRTUAL_ENV?.trim();
  if (virtualEnvironment) {
    pathCandidates.push({
      command: path.join(
        virtualEnvironment,
        process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
      ),
      label: "active virtual environment",
    });
  }

  const relativePythonPaths =
    process.platform === "win32"
      ? ["data/local-tts/.venv/Scripts/python.exe", ".venv/Scripts/python.exe"]
      : ["data/local-tts/.venv/bin/python", ".venv/bin/python"];
  pathCandidates.push(
    ...relativePythonPaths.map((relativePath) => ({
      command: path.join(repoRoot, relativePath),
      label: relativePath,
    })),
  );

  for (const candidate of pathCandidates) {
    if (await pathExists(candidate.command)) {
      candidates.push(candidate);
    }
  }

  candidates.push({
    command: process.platform === "win32" ? "python" : "python3",
    label: "Python on PATH",
  });
  return candidates.filter(
    (candidate, index, all) =>
      all.findIndex((other) => other.command === candidate.command) === index,
  );
}

function pythonSetupInstructions() {
  if (process.platform === "win32") {
    return [
      "python -m venv data/local-tts/.venv",
      ".\\data\\local-tts\\.venv\\Scripts\\python.exe -m pip install --requirement tts_sidecar/requirements.txt",
    ];
  }

  return [
    "python3 -m venv data/local-tts/.venv",
    "./data/local-tts/.venv/bin/python -m pip install --requirement tts_sidecar/requirements.txt",
  ];
}

async function resolvePython() {
  const failures = [];
  for (const candidate of await pythonCandidates()) {
    const result = await runCaptured(
      candidate.command,
      ["-c", pythonProbe],
      pythonProbeTimeoutMs,
    );
    if (result.code === 0) {
      const readyLine = lastUsefulLine(result.stdout);
      const resolvedExecutable = readyLine?.startsWith("AAP_PYTHON_READY:")
        ? readyLine.slice("AAP_PYTHON_READY:".length).trim()
        : "";
      if (!path.isAbsolute(resolvedExecutable)) {
        failures.push(`${candidate.label}: probe returned no absolute executable`);
        continue;
      }
      return {
        command: resolvedExecutable,
        label: candidate.label,
      };
    }

    const probeError = lastUsefulLine(result.stderr);
    failures.push(
      `${candidate.label}: ${
        result.error
          ? "could not execute"
          : probeError?.startsWith("AAP_PYTHON_ERROR:")
            ? probeError.slice("AAP_PYTHON_ERROR:".length)
            : `probe exited ${result.code}`
      }`,
    );
  }

  const instructions = pythonSetupInstructions();
  throw new Error(
    [
      "No ready Python 3.12 sidecar environment was found.",
      "Create the ignored local environment (the launcher never installs it automatically):",
      ...instructions.map((instruction) => `  ${instruction}`),
      "Then rerun pnpm dev, or set ADAPTIVE_AUDIO_PLAYER_PYTHON to another ready interpreter.",
      `Checked: ${failures.join("; ")}`,
    ].join("\n"),
  );
}

const chatterboxPythonProbe = String.raw`
import importlib
import importlib.metadata
import sys

try:
    if sys.version_info[:2] != (3, 11):
        raise RuntimeError(f"Python 3.11 is required; found {sys.version.split()[0]}")
    expected = {
        "chatterbox-tts": "0.1.7",
        "torch": "2.11.0+cu130",
        "torchaudio": "2.11.0+cu130",
    }
    for package, version in expected.items():
        actual = importlib.metadata.version(package)
        if actual != version:
            raise RuntimeError(f"{package} must be {version}; found {actual}")
    for module in ("chatterbox.tts", "fastapi", "soundfile", "torch", "uvicorn"):
        importlib.import_module(module)
    import torch
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable")
    if torch.cuda.get_device_properties(0).total_memory < 8 * 1024 * 1024 * 1024:
        raise RuntimeError("at least 8 GB of NVIDIA GPU memory is required")
except Exception as error:
    print(f"AAP_CHATTERBOX_ERROR:{type(error).__name__}: {error}", file=sys.stderr)
    sys.exit(1)

print(f"AAP_CHATTERBOX_READY:{sys.executable}")
`;

export async function resolveChatterboxRuntime() {
  const python = path.join(
    chatterboxRuntimeRoot,
    ".venv",
    process.platform === "win32" ? "Scripts" : "bin",
    process.platform === "win32" ? "python.exe" : "python",
  );
  if (!(await pathExists(python)) || !(await pathExists(chatterboxManifestPath))) {
    return null;
  }

  try {
    const manifest = JSON.parse(await readFile(chatterboxManifestPath, "utf8"));
    if (
      manifest?.package?.name !== "chatterbox-tts" ||
      manifest?.package?.version !== "0.1.7" ||
      manifest?.runtime?.python !== "3.11" ||
      manifest?.runtime?.torch !== "2.11.0+cu130" ||
      manifest?.runtime?.torchaudio !== "2.11.0+cu130" ||
      manifest?.model?.revision !==
        "5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18" ||
      manifest?.voice?.id !== "chatterbox-default" ||
      manifest?.voice?.referenceAudioAllowed !== false
    ) {
      throw new Error("installation manifest does not match the approved runtime");
    }
  } catch (error) {
    console.warn(
      `[dev] High Quality installation is invalid (${error instanceof Error ? error.message : error}); Fast / Compatible remains available.`,
    );
    return null;
  }

  const probe = await runCaptured(
    python,
    ["-c", chatterboxPythonProbe],
    30_000,
    {
      HF_HUB_OFFLINE: "1",
      TRANSFORMERS_OFFLINE: "1",
    },
  );
  if (probe.code !== 0) {
    const detail = lastUsefulLine(probe.stderr);
    console.warn(
      `[dev] High Quality runtime is installed but not ready (${detail?.replace("AAP_CHATTERBOX_ERROR:", "") ?? "probe failed"}); Fast / Compatible remains available.`,
    );
    return null;
  }

  return {
    command: python,
    modelRoot: path.join(chatterboxRuntimeRoot, "model"),
    runtimeRoot: chatterboxRuntimeRoot,
  };
}

async function prepareChatterboxConfig(config, runtime) {
  if (!runtime) {
    return { ...config, chatterboxPort: null };
  }

  let chatterboxPort = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = await findAvailableLoopbackPort(defaultTtsHost);
    if (candidate !== config.appPort && candidate !== config.ttsPort) {
      chatterboxPort = candidate;
      break;
    }
  }
  if (chatterboxPort === null) {
    console.warn(
      "[dev] Could not reserve a High Quality loopback port; Fast / Compatible remains available.",
    );
    return { ...config, chatterboxPort: null };
  }

  const chatterboxOrigin = formatLoopbackOrigin(
    defaultTtsHost,
    chatterboxPort,
  );
  return {
    ...config,
    chatterboxHealthUrl: new URL("/health", chatterboxOrigin).toString(),
    chatterboxHost: defaultTtsHost,
    chatterboxOrigin,
    chatterboxPort,
    chatterboxSecret: randomBytes(32).toString("hex"),
  };
}

class HealthContractError extends Error {}

async function fetchJson(url, timeoutMs, headers = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json", ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  return { payload, response };
}

async function waitForChatterboxSidecar(config, record) {
  const timeoutMs = Math.max(config.healthTimeoutMs, 120_000);
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (!shuttingDown && Date.now() < deadline) {
    assertChildStillRunning(record);
    try {
      const remainingMs = Math.max(1, deadline - Date.now());
      const { payload, response } = await fetchJson(
        config.chatterboxHealthUrl,
        Math.min(2_000, remainingMs),
        {
          "x-adaptive-audio-player-tts-secret": config.chatterboxSecret,
        },
      );
      if (!response.ok) {
        throw new Error(`health returned HTTP ${response.status}`);
      }
      if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload) ||
        Object.keys(payload).sort().join(",") !==
          "component,protocolVersion,ready" ||
        payload.component !== "adaptive-audio-player-chatterbox-tts" ||
        payload.protocolVersion !== 1 ||
        payload.ready !== true
      ) {
        throw new HealthContractError(
          `another service or an incompatible High Quality sidecar answered at ${config.chatterboxHealthUrl}`,
        );
      }
      assertChildStillRunning(record);
      console.log(`[dev] High Quality sidecar healthy at ${config.chatterboxOrigin}`);
      return true;
    } catch (error) {
      if (error instanceof HealthContractError) {
        throw error;
      }
      lastError = error;
      await delay(healthPollMs);
    }
  }

  throw new Error(
    `High Quality sidecar did not become healthy within ${timeoutMs} ms${
      lastError instanceof Error ? `: ${lastError.message}` : ""
    }`,
  );
}

function assertChildStillRunning(record) {
  if (record.child.exitCode !== null || record.child.signalCode !== null) {
    throw new Error(`${record.name} exited before it became ready.`);
  }
}

async function waitForSidecar(config, record) {
  const deadline = Date.now() + config.healthTimeoutMs;
  let lastError = null;

  while (!shuttingDown && Date.now() < deadline) {
    assertChildStillRunning(record);
    try {
      const remainingMs = Math.max(1, deadline - Date.now());
      const { payload, response } = await fetchJson(
        config.ttsHealthUrl,
        Math.min(1_000, remainingMs),
      );
      if (!response.ok) {
        throw new Error(`health returned HTTP ${response.status}`);
      }
      if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload) ||
        Object.keys(payload).sort().join(",") !==
          "component,protocolVersion,ready" ||
        payload.component !== "adaptive-audio-player-local-tts" ||
        payload.protocolVersion !== 1
      ) {
        throw new HealthContractError(
          `another service or an incompatible sidecar answered at ${config.ttsHealthUrl}`,
        );
      }
      if (payload.ready !== true) {
        throw new HealthContractError(
          config.ttsOffline
            ? "offline mode requires all pinned Kokoro resources to be present and SHA-256 verified"
            : "the pinned Kokoro resources are missing or failed SHA-256 verification",
        );
      }

      assertChildStillRunning(record);
      console.log(`[dev] sidecar healthy at ${config.ttsOrigin}`);
      return;
    } catch (error) {
      if (error instanceof HealthContractError) {
        throw error;
      }
      lastError = error;
      await delay(healthPollMs);
    }
  }

  throw new Error(
    `local TTS sidecar did not become healthy within ${config.healthTimeoutMs} ms${
      lastError instanceof Error ? `: ${lastError.message}` : ""
    }`,
  );
}

async function waitForApp(config, record) {
  const deadline = Date.now() + config.healthTimeoutMs;
  let lastError = null;

  while (!shuttingDown && Date.now() < deadline) {
    assertChildStillRunning(record);
    try {
      const response = await fetch(appUrl, {
        cache: "no-store",
        headers: { accept: "text/html" },
        signal: AbortSignal.timeout(Math.min(1_000, Math.max(1, deadline - Date.now()))),
      });
      if (response.ok) {
        assertChildStillRunning(record);
        console.log(`[dev] app healthy at ${appUrl}`);
        return;
      }
      lastError = new Error(`app returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(healthPollMs);
  }

  throw new Error(
    `Next.js did not become healthy within ${config.healthTimeoutMs} ms${
      lastError instanceof Error ? `: ${lastError.message}` : ""
    }`,
  );
}

export async function main() {
  await loadDevelopmentEnvironment();
  let config = await prepareDevelopmentConfig(readDevelopmentConfig());
  const chatterboxRuntime = await resolveChatterboxRuntime();
  config = await prepareChatterboxConfig(config, chatterboxRuntime);
  activeConfig = config;
  const python = await resolvePython();
  console.log(`[dev] using Python from ${python.label}`);

  const sharedRuntimeEnvironment = {
    ADAPTIVE_AUDIO_PLAYER_TTS_URL: config.ttsOrigin,
  };
  const sidecar = startChild(
    python.command,
    ["-m", "tts_sidecar.server"],
    "Kokoro sidecar",
    {
      ...sharedRuntimeEnvironment,
      ADAPTIVE_AUDIO_PLAYER_TTS_HOST: config.ttsHost,
      ADAPTIVE_AUDIO_PLAYER_TTS_PORT: String(config.ttsPort),
    },
  );
  await waitForSidecar(config, sidecar);

  if (chatterboxRuntime && config.chatterboxPort) {
    const chatterboxSidecar = startChild(
      chatterboxRuntime.command,
      ["-m", "chatterbox_sidecar.server"],
      "High Quality sidecar",
      {
        ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_HOST: config.chatterboxHost,
        ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_MODEL_ROOT:
          chatterboxRuntime.modelRoot,
        ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_PORT: String(config.chatterboxPort),
        ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_ROOT:
          chatterboxRuntime.runtimeRoot,
        ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_SECRET: config.chatterboxSecret,
        HF_HUB_OFFLINE: "1",
        TRANSFORMERS_OFFLINE: "1",
      },
      { required: false },
    );
    try {
      await waitForChatterboxSidecar(config, chatterboxSidecar);
      Object.assign(sharedRuntimeEnvironment, {
        ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_ROOT:
          chatterboxRuntime.runtimeRoot,
        ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_SECRET: config.chatterboxSecret,
        ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_URL: config.chatterboxOrigin,
      });
    } catch (error) {
      console.warn(
        `[dev] ${error instanceof Error ? error.message : error}; Fast / Compatible remains available.`,
      );
      await terminateChildTree(chatterboxSidecar, true);
    }
  } else {
    console.log(
      "[dev] optional High Quality runtime is not installed; run pnpm chatterbox:install to add it.",
    );
  }

  startChild(
    process.execPath,
    ["scripts/job-worker.mjs"],
    "generation worker",
    sharedRuntimeEnvironment,
  );
  await delay(250);
  if (shuttingDown) {
    throw new Error("generation worker stopped during startup");
  }

  const nextApp = startChild(
    process.execPath,
    [nextCliPath, "dev", "--hostname", "127.0.0.1", "--port", "3100"],
    "Next.js",
    sharedRuntimeEnvironment,
  );
  await waitForApp(config, nextApp);
  console.log("[dev] local runtime ready; press Ctrl+C to stop all services.");
  process.send?.({
    type: "adaptive-audio-player-dev-ready",
    appUrl,
    children: children.map((record) => ({
      name: record.name,
      pid: record.child.pid,
    })),
    ttsOrigin: config.ttsOrigin,
    chatterboxOrigin: config.chatterboxOrigin ?? null,
  });
}

function registerLifecycleHandlers() {
  const terminationSignals = [
    "SIGINT",
    "SIGTERM",
    ...(process.platform === "win32" ? ["SIGBREAK"] : []),
  ];

  for (const signal of terminationSignals) {
    process.once(signal, () => {
      void shutdown(0, signal);
    });
  }

  process.on("message", (message) => {
    if (
      message === "shutdown" ||
      (message &&
        typeof message === "object" &&
        message.type === "adaptive-audio-player-dev-shutdown")
    ) {
      void shutdown(0, "parent requested shutdown");
    }
  });
}

export function runDevelopmentSupervisor() {
  registerLifecycleHandlers();
  return main().catch(async (error) => {
    if (!shuttingDown) {
      console.error(`[dev] ${error instanceof Error ? error.message : error}`);
    }
    await shutdown(1, "startup failed");
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  void runDevelopmentSupervisor();
}
