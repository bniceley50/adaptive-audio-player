import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";

export const runtimeComponentOrder = Object.freeze([
  "sidecar",
  "worker",
  "server",
]);
export const workerReadyMessageType = "adaptive-audio-player-worker-ready";
export const workerReadyPrefix = "AAP_WORKER_READY ";
export const localSessionCookieName =
  "adaptive_audio_player_local_session";
export const ttsSecretHeaderName =
  "x-adaptive-audio-player-tts-secret";
const guardianReadyPrefix = "AAP_GUARDIAN_READY ";

const ownerGuardianSource = String.raw`
const { spawn } = require("node:child_process");
const path = require("node:path");

let buffer = "";
let child = null;
let stopping = false;

function terminateTree(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve();
    const taskkill = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe");
    const killer = spawn(taskkill, ["/PID", String(pid), "/T", "/F"], {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    killer.once("error", resolve);
    killer.once("exit", resolve);
  });
}

async function stopAndExit(code = 0) {
  if (stopping) return;
  stopping = true;
  await terminateTree(child?.pid);
  process.exit(code);
}

function start(config) {
  if (child) throw new Error("Guardian received more than one start command.");
  child = spawn(config.command, config.args, {
    cwd: config.cwd,
    env: config.env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  child.once("spawn", () => {
    process.stdout.write(${JSON.stringify(guardianReadyPrefix)} + JSON.stringify({
      type: "adaptive-audio-player-guardian-ready",
      component: config.component,
      pid: child.pid,
    }) + "\n");
  });
  child.once("error", (error) => {
    process.stderr.write("[guardian] " + error.message + "\n");
  });
  child.once("exit", (code) => {
    if (!stopping) process.exit(code ?? 1);
  });
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() || "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    if (message.type === "start") start(message);
    else if (message.type === "stop") void stopAndExit(0);
  }
});
for (const eventName of ["end", "close", "error"]) {
  process.stdin.once(eventName, () => void stopAndExit(0));
}
process.stdin.resume();
`;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function childExitPromise(child) {
  return new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

export class DesktopRuntimeSupervisor {
  constructor({
    components,
    restartLimit = 2,
    restartBackoffMs = 250,
    wait = delay,
    onFatalError = () => {},
  }) {
    for (const name of runtimeComponentOrder) {
      if (!components[name]) {
        throw new Error(`Missing required runtime component: ${name}`);
      }
    }
    this.components = components;
    this.restartLimit = restartLimit;
    this.restartBackoffMs = restartBackoffMs;
    this.wait = wait;
    this.onFatalError = onFatalError;
    this.children = new Map();
    this.restartAttempts = 0;
    this.recoveryPromise = null;
    this.state = "stopped";
    this.epoch = 0;
  }

  async start() {
    if (this.state !== "stopped") {
      throw new Error(`Runtime cannot start while ${this.state}.`);
    }
    this.restartAttempts = 0;
    await this.startAll();
  }

  async startAll() {
    const epoch = ++this.epoch;
    this.state = "starting";
    try {
      for (const name of runtimeComponentOrder) {
        const descriptor = this.components[name];
        const child = await descriptor.launch();
        const exitPromise = childExitPromise(child);
        const record = { child, descriptor, epoch, expectedExit: false, exitPromise };
        this.children.set(name, record);
        exitPromise.then((details) => {
          if (
            !record.expectedExit &&
            record.epoch === this.epoch &&
            this.state === "running"
          ) {
            this.scheduleRecovery(name, details);
          }
        });
        await Promise.race([
          descriptor.waitUntilReady(child),
          exitPromise.then(({ code, signal }) => {
            throw new Error(
              `${name} exited before readiness (code=${code}, signal=${signal}).`,
            );
          }),
        ]);
      }
      this.state = "running";
    } catch (error) {
      this.state = "stopping";
      await this.stopChildren();
      this.state = "failed";
      throw error;
    }
  }

  scheduleRecovery(name, details) {
    if (this.recoveryPromise) {
      return;
    }
    this.recoveryPromise = this.recover(name, details).finally(() => {
      this.recoveryPromise = null;
    });
  }

  async recover(name, details) {
    while (this.restartAttempts < this.restartLimit) {
      this.restartAttempts += 1;
      this.state = "restarting";
      await this.stopChildren();
      await this.wait(this.restartBackoffMs * this.restartAttempts);
      this.state = "stopped";
      try {
        await this.startAll();
        return;
      } catch (error) {
        if (this.restartAttempts >= this.restartLimit) {
          this.state = "failed";
          this.onFatalError(error);
          return;
        }
      }
    }
    await this.stopChildren();
    this.state = "failed";
    this.onFatalError(
      new Error(
        `${name} exited unexpectedly (code=${details.code}, signal=${details.signal}).`,
      ),
    );
  }

  async stopChildren() {
    const shutdownOrder = ["worker", "server", "sidecar"];
    for (const name of shutdownOrder) {
      const record = this.children.get(name);
      if (!record) {
        continue;
      }
      record.expectedExit = true;
      await record.descriptor.stop(record.child);
      this.children.delete(name);
    }
  }

  async stop() {
    if (this.state === "stopped") {
      return;
    }
    this.epoch += 1;
    this.state = "stopping";
    await this.stopChildren();
    this.state = "stopped";
  }

  async waitForRecovery() {
    await this.recoveryPromise;
  }
}

function waitForOwnerClose(ownerInput) {
  return new Promise((resolve) => {
    if (ownerInput.readableEnded || ownerInput.destroyed) {
      resolve();
      return;
    }
    let closed = false;
    const finish = () => {
      if (!closed) {
        closed = true;
        resolve();
      }
    };
    ownerInput.once("end", finish);
    ownerInput.once("close", finish);
    ownerInput.once("error", finish);
    ownerInput.resume();
  });
}

export function waitForWorkerReady(child, timeoutMs = 30_000) {
  if (!child.stdout) {
    return Promise.reject(new Error("Worker stdout must be piped for readiness."));
  }
  return new Promise((resolve, reject) => {
    let buffer = "";
    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout?.off("data", onData);
      child.off("exit", onExit);
    };
    const finish = (error, value) => {
      cleanup();
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith(workerReadyPrefix)) continue;
        try {
          const message = JSON.parse(line.slice(workerReadyPrefix.length));
          if (
            message.type !== workerReadyMessageType ||
            message.protocolVersion !== 1 ||
            message.workerName !== "generation-worker"
          ) {
            throw new Error("Worker readiness contract is incompatible.");
          }
          finish(null, message);
          return;
        } catch (error) {
          finish(
            error instanceof Error
              ? error
              : new Error("Worker readiness could not be parsed."),
          );
          return;
        }
      }
    };
    const onExit = (code, signal) =>
      finish(
        new Error(
          `Worker exited before readiness (code=${code}, signal=${signal}).`,
        ),
      );
    const timeout = setTimeout(
      () => finish(new Error("Worker readiness timed out.")),
      timeoutMs,
    );
    child.stdout.on("data", onData);
    child.once("exit", onExit);
  });
}

export function resolvePackagedRuntimePaths(resourcesPath) {
  if (typeof resourcesPath !== "string" || !path.isAbsolute(resourcesPath)) {
    throw new Error("Electron resourcesPath must be absolute.");
  }
  const runtimeRoot = path.join(path.normalize(resourcesPath), "runtime");
  const paths = {
    runtimeRoot,
    nodeExecutable: path.join(runtimeRoot, "node", "node.exe"),
    appRoot: path.join(runtimeRoot, "app"),
    serverEntry: path.join(runtimeRoot, "app", "server.js"),
    workerEntry: path.join(runtimeRoot, "app", "scripts", "job-worker.mjs"),
    sidecarRoot: path.join(runtimeRoot, "tts"),
    sidecarExecutable: path.join(
      runtimeRoot,
      "tts",
      "AdaptiveAudioPlayerTTS.exe",
    ),
    modelRoot: path.join(
      runtimeRoot,
      "tts",
      "_internal",
      "models",
      "kokoro",
      "f3ff3571791e39611d31c381e3a41a3af07b4987",
    ),
  };
  for (const [name, candidate] of Object.entries(paths)) {
    if (!existsSync(candidate)) {
      throw new Error(`Packaged runtime ${name} is missing: ${candidate}`);
    }
  }
  return paths;
}

export function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Windows did not allocate a loopback port."));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

function launchGuardedProcess({
  component,
  guardianNode,
  command,
  args,
  cwd,
  env,
  spawnProcess,
}) {
  const guardian = spawnProcess(guardianNode, ["-e", ownerGuardianSource], {
    cwd,
    env: {
      SystemRoot: env.SystemRoot ?? process.env.SystemRoot ?? "C:\\Windows",
    },
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  guardian.stdin.write(
    `${JSON.stringify({ type: "start", component, command, args, cwd, env })}\n`,
  );
  return guardian;
}

async function stopGuardedProcess(child, timeoutMs = 10_000) {
  if (child.exitCode !== null || child.signalCode) {
    return;
  }
  const exitPromise = childExitPromise(child);
  child.stdin.end(`${JSON.stringify({ type: "stop" })}\n`);
  let timeout;
  const outcome = await Promise.race([
    exitPromise.then(() => "exit"),
    new Promise((resolve) => {
      timeout = setTimeout(() => resolve("timeout"), timeoutMs);
      timeout.unref?.();
    }),
  ]);
  clearTimeout(timeout);
  if (outcome === "timeout" && child.pid) {
    await terminateOwnedProcessTree(child.pid);
    await exitPromise;
  }
}

async function waitForHttpReady({
  url,
  validate,
  fetchImpl,
  headers,
  timeoutMs = 60_000,
}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(url, {
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(2_000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const value = await validate(response);
      if (value) {
        return value;
      }
      throw new Error("incompatible readiness response");
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  throw new Error(
    `Readiness timed out for ${url}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

function matchesReadyHealthContract(payload, component) {
  return (
    typeof payload === "object" &&
    payload !== null &&
    !Array.isArray(payload) &&
    Object.keys(payload).sort().join(",") ===
      "component,protocolVersion,ready" &&
    payload.component === component &&
    payload.protocolVersion === 1 &&
    payload.ready === true
  );
}

function randomSecret(randomBytesImpl = randomBytes) {
  return randomBytesImpl(32).toString("hex");
}

export function createLaunchSecrets(randomBytesImpl = randomBytes) {
  return {
    sessionSecret: randomSecret(randomBytesImpl),
    ttsSecret: randomSecret(randomBytesImpl),
  };
}

export async function startPackagedRuntime({
  resourcesPath,
  environment = process.env,
  spawnProcess = spawn,
  fetchImpl = globalThis.fetch,
  reservePort = reserveLoopbackPort,
  onFatalError = () => {},
}) {
  const paths = resolvePackagedRuntimePaths(resourcesPath);
  const [sidecarPort, serverPort] = await Promise.all([
    reservePort(),
    reservePort(),
  ]);
  if (sidecarPort === serverPort) {
    throw new Error("Runtime services received the same loopback port.");
  }
  const ttsOrigin = `http://127.0.0.1:${sidecarPort}`;
  const appOrigin = `http://127.0.0.1:${serverPort}`;
  const commonEnvironment = {
    ...environment,
    NODE_ENV: "production",
  };
  const { sessionSecret, ttsSecret } = createLaunchSecrets();
  environment.ADAPTIVE_AUDIO_PLAYER_APP_ORIGIN = appOrigin;
  environment.ADAPTIVE_AUDIO_PLAYER_TTS_SECRET = ttsSecret;
  environment.ADAPTIVE_AUDIO_PLAYER_TTS_URL = ttsOrigin;
  environment.ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET = sessionSecret;

  const launch = (component, command, args, cwd, env) =>
    launchGuardedProcess({
      component,
      guardianNode: paths.nodeExecutable,
      command,
      args,
      cwd,
      env,
      spawnProcess,
    });
  const stop = (child) => stopGuardedProcess(child);
  const components = {
    sidecar: {
      launch: () =>
        launch("sidecar", paths.sidecarExecutable, [], paths.sidecarRoot, {
          ...commonEnvironment,
          ADAPTIVE_AUDIO_PLAYER_TTS_HOST: "127.0.0.1",
          ADAPTIVE_AUDIO_PLAYER_TTS_PORT: String(sidecarPort),
          ADAPTIVE_AUDIO_PLAYER_TTS_MODEL_ROOT: paths.modelRoot,
          ADAPTIVE_AUDIO_PLAYER_TTS_SECRET: ttsSecret,
        }),
      waitUntilReady: async (child) => {
        const health = await waitForHttpReady({
          url: `${ttsOrigin}/health`,
          fetchImpl,
          headers: {
            [ttsSecretHeaderName]: ttsSecret,
          },
          validate: async (response) => {
            const payload = await response.json();
            return matchesReadyHealthContract(
              payload,
              "adaptive-audio-player-local-tts",
            )
              ? payload
              : null;
          },
        });
        child.stdout.on("data", () => {});
        child.stderr.on("data", () => {});
        return health;
      },
      stop,
    },
    worker: {
      launch: () =>
        launch(
          "worker",
          paths.nodeExecutable,
          [paths.workerEntry],
          paths.appRoot,
          {
            ...commonEnvironment,
            ADAPTIVE_AUDIO_PLAYER_TTS_SECRET: ttsSecret,
            ADAPTIVE_AUDIO_PLAYER_TTS_URL: ttsOrigin,
          },
        ),
      waitUntilReady: async (child) => {
        const ready = await waitForWorkerReady(child);
        child.stdout.on("data", () => {});
        child.stderr.on("data", () => {});
        return ready;
      },
      stop,
    },
    server: {
      launch: () =>
        launch(
          "server",
          paths.nodeExecutable,
          [paths.serverEntry],
          paths.appRoot,
          {
            ...commonEnvironment,
            ADAPTIVE_AUDIO_PLAYER_APP_ORIGIN: appOrigin,
            ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET:
              sessionSecret,
            ADAPTIVE_AUDIO_PLAYER_TTS_SECRET: ttsSecret,
            ADAPTIVE_AUDIO_PLAYER_TTS_URL: ttsOrigin,
            HOSTNAME: "127.0.0.1",
            PORT: String(serverPort),
          },
        ),
      waitUntilReady: async (child) => {
        const ready = await waitForHttpReady({
          url: `${appOrigin}/api/health`,
          fetchImpl,
          headers: {
            cookie: `${localSessionCookieName}=${sessionSecret}`,
          },
          validate: async (response) => {
            const payload = await response.json();
            return matchesReadyHealthContract(
              payload,
              "adaptive-audio-player-app",
            )
              ? payload
              : null;
          },
        });
        child.stdout.on("data", () => {});
        child.stderr.on("data", () => {});
        return ready;
      },
      stop,
    },
  };
  const supervisor = new DesktopRuntimeSupervisor({
    components,
    onFatalError,
    restartBackoffMs: 500,
  });
  await supervisor.start();
  return {
    appOrigin,
    ttsOrigin,
    localSession: {
      cookieName: localSessionCookieName,
      secret: sessionSecret,
    },
    paths,
    supervisor,
    stop: () => supervisor.stop(),
  };
}

export async function terminateOwnedProcessTree(
  pid,
  { platform = process.platform, spawnProcess = spawn } = {},
) {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error("A positive child PID is required for tree termination.");
  }
  if (platform !== "win32") {
    process.kill(pid, "SIGTERM");
    return;
  }

  const windowsRoot = process.env.SystemRoot ?? "C:\\Windows";
  const taskkill = path.join(windowsRoot, "System32", "taskkill.exe");
  await new Promise((resolve, reject) => {
    const killer = spawnProcess(taskkill, ["/PID", String(pid), "/T", "/F"], {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    killer.once("error", reject);
    killer.once("exit", (code) => {
      if (code === 0 || code === 128) {
        resolve();
      } else {
        reject(new Error(`taskkill exited with code ${code}.`));
      }
    });
  });
}

export async function runOwnerGuardedCommand({
  command,
  args = [],
  cwd,
  env = process.env,
  ownerInput = process.stdin,
  onStarted = () => {},
  spawnProcess = spawn,
  terminateTree = terminateOwnedProcessTree,
}) {
  if (!path.isAbsolute(command) || !path.isAbsolute(cwd)) {
    throw new Error("Guarded command and cwd must be absolute paths.");
  }
  const child = spawnProcess(command, args, {
    cwd,
    env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const exitPromise = childExitPromise(child);
  const spawned = new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  await spawned;
  onStarted(child);

  const outcome = await Promise.race([
    exitPromise.then((details) => ({ type: "child-exit", details })),
    waitForOwnerClose(ownerInput).then(() => ({ type: "owner-close" })),
  ]);
  if (outcome.type === "owner-close" && child.pid) {
    await terminateTree(child.pid);
    await exitPromise;
  }
  return outcome;
}
