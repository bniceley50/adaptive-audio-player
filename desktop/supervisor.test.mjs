import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { PassThrough } from "node:stream";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

import {
  createLaunchSecrets,
  DesktopRuntimeSupervisor,
  runOwnerGuardedCommand,
  runtimeComponentOrder,
  startPackagedRuntime,
  ttsSecretHeaderName,
  waitForWorkerReady,
  workerReadyMessageType,
  workerReadyPrefix,
} from "./supervisor.mjs";

class FakeChild extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
  }
}

function createFakeGuardian(onStart) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.pid = 1234;
  let buffer = "";
  child.stdin.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      if (message.type === "start") {
        onStart(message);
        setTimeout(() => {
          child.stdout.write(
            `AAP_GUARDIAN_READY ${JSON.stringify({
              type: "adaptive-audio-player-guardian-ready",
              component: message.component,
              pid: child.pid,
            })}\n`,
          );
          if (message.component === "worker") {
            child.stdout.write(
              `${workerReadyPrefix}${JSON.stringify({
                type: workerReadyMessageType,
                protocolVersion: 1,
                workerName: "generation-worker",
              })}\n`,
            );
          }
        }, 0);
      } else if (message.type === "stop") {
        setTimeout(() => {
          child.exitCode = 0;
          child.emit("exit", 0, null);
        }, 0);
      }
    }
  });
  return child;
}

function createFakeComponents(events) {
  const launched = new Map();
  const components = {};
  for (const name of runtimeComponentOrder) {
    components[name] = {
      launch: vi.fn(async () => {
        events.push(`launch:${name}`);
        const child = new FakeChild(name);
        launched.set(name, child);
        return child;
      }),
      waitUntilReady: vi.fn(async () => {
        events.push(`ready:${name}`);
      }),
      stop: vi.fn(async (child) => {
        events.push(`stop:${name}`);
        child.emit("exit", 0, null);
      }),
    };
  }
  return { components, launched };
}

async function waitUntil(predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for lifecycle proof.");
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function forceKill(pid, includeTree = false) {
  if (!isProcessRunning(pid)) {
    return;
  }
  const taskkill = path.join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "taskkill.exe",
  );
  await new Promise((resolve) => {
    const args = ["/PID", String(pid), ...(includeTree ? ["/T"] : []), "/F"];
    const child = spawn(taskkill, args, {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("exit", resolve);
    child.once("error", resolve);
  });
}

describe("desktop runtime supervision", () => {
  it("creates independent 256-bit app and TTS launch secrets", () => {
    let call = 0;
    const secrets = createLaunchSecrets((size) => {
      call += 1;
      return Buffer.alloc(size, call);
    });

    expect(secrets).toEqual({
      sessionSecret: "01".repeat(32),
      ttsSecret: "02".repeat(32),
    });
    expect(secrets.sessionSecret).not.toBe(secrets.ttsSecret);
    expect(ttsSecretHeaderName).toBe(
      "x-adaptive-audio-player-tts-secret",
    );
  });

  it("passes the paired app origin and session secret only to the server", async () => {
    const resourcesPath = mkdtempSync(
      path.join(tmpdir(), "adaptive-audio-supervisor-"),
    );
    const runtimeRoot = path.join(resourcesPath, "runtime");
    const modelRoot = path.join(
      runtimeRoot,
      "tts",
      "_internal",
      "models",
      "kokoro",
      "f3ff3571791e39611d31c381e3a41a3af07b4987",
    );
    const requiredFiles = [
      path.join(runtimeRoot, "node", "node.exe"),
      path.join(runtimeRoot, "app", "server.js"),
      path.join(runtimeRoot, "app", "scripts", "job-worker.mjs"),
      path.join(runtimeRoot, "tts", "AdaptiveAudioPlayerTTS.exe"),
    ];
    for (const file of requiredFiles) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, "");
    }
    mkdirSync(modelRoot, { recursive: true });
    const launches = new Map();
    const environment = { SystemRoot: "C:\\Windows" };
    const reservePort = vi
      .fn()
      .mockResolvedValueOnce(4101)
      .mockResolvedValueOnce(4102);
    const fetchImpl = vi.fn(async (url) => {
      const component = url.startsWith("http://127.0.0.1:4101")
        ? "adaptive-audio-player-local-tts"
        : "adaptive-audio-player-app";
      return new Response(
        JSON.stringify({ component, protocolVersion: 1, ready: true }),
        { status: 200 },
      );
    });

    let runtime;
    try {
      runtime = await startPackagedRuntime({
        resourcesPath,
        environment,
        reservePort,
        fetchImpl,
        spawnProcess: () =>
          createFakeGuardian((message) => {
            launches.set(message.component, message);
          }),
      });

      const serverEnvironment = launches.get("server").env;
      expect(serverEnvironment.ADAPTIVE_AUDIO_PLAYER_APP_ORIGIN).toBe(
        runtime.appOrigin,
      );
      expect(serverEnvironment.ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET).toBe(
        runtime.localSession.secret,
      );
      expect(launches.get("sidecar").env).not.toHaveProperty(
        "ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET",
      );
      expect(launches.get("worker").env).not.toHaveProperty(
        "ADAPTIVE_AUDIO_PLAYER_SESSION_SECRET",
      );
    } finally {
      await runtime?.stop();
      rmSync(resourcesPath, { force: true, recursive: true });
    }
  });

  it("starts in dependency order and stops in persistence order", async () => {
    const events = [];
    const { components } = createFakeComponents(events);
    const supervisor = new DesktopRuntimeSupervisor({ components });

    await supervisor.start();
    await supervisor.stop();

    expect(events).toEqual([
      "launch:sidecar",
      "ready:sidecar",
      "launch:worker",
      "ready:worker",
      "launch:server",
      "ready:server",
      "stop:worker",
      "stop:server",
      "stop:sidecar",
    ]);
    expect(supervisor.state).toBe("stopped");
  });

  it("performs at most two bounded full-stack restarts", async () => {
    const events = [];
    const fatalErrors = [];
    const { components, launched } = createFakeComponents(events);
    const supervisor = new DesktopRuntimeSupervisor({
      components,
      restartBackoffMs: 10,
      wait: vi.fn(async (milliseconds) => events.push(`wait:${milliseconds}`)),
      onFatalError: (error) => fatalErrors.push(error),
    });
    await supervisor.start();

    launched.get("worker").emit("exit", 1, null);
    await Promise.resolve();
    await supervisor.waitForRecovery();
    launched.get("server").emit("exit", 2, null);
    await Promise.resolve();
    await supervisor.waitForRecovery();
    launched.get("sidecar").emit("exit", 3, null);
    await Promise.resolve();
    await supervisor.waitForRecovery();

    expect(components.sidecar.launch).toHaveBeenCalledTimes(3);
    expect(components.worker.launch).toHaveBeenCalledTimes(3);
    expect(components.server.launch).toHaveBeenCalledTimes(3);
    expect(events.filter((event) => event.startsWith("wait:"))).toEqual([
      "wait:10",
      "wait:20",
    ]);
    expect(fatalErrors).toHaveLength(1);
    expect(supervisor.state).toBe("failed");
    expect(supervisor.children.size).toBe(0);
  });

  it("accepts only the versioned generation-worker readiness contract", async () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    const readiness = waitForWorkerReady(child, 1_000);
    child.stdout.write("ordinary worker log\n");
    child.stdout.write(
      `${workerReadyPrefix}${JSON.stringify({
        type: workerReadyMessageType,
        protocolVersion: 1,
        workerName: "generation-worker",
      })}\n`,
    );

    await expect(readiness).resolves.toEqual({
      type: workerReadyMessageType,
      protocolVersion: 1,
      workerName: "generation-worker",
    });
  });

  it.runIf(process.platform === "win32")(
    "kills the guarded service tree when its desktop owner is force-terminated",
    async () => {
      const supervisorUrl = pathToFileURL(
        fileURLToPath(new URL("./supervisor.mjs", import.meta.url)),
      ).href;
      const grandchildCode = "setInterval(() => {}, 1000);";
      const serviceCode = `
        const { spawn } = require("node:child_process");
        const child = spawn(process.execPath, ["-e", ${JSON.stringify(grandchildCode)}], {
          stdio: "ignore",
          windowsHide: true,
        });
        console.log(JSON.stringify({ type: "grandchild", pid: child.pid }));
        setInterval(() => {}, 1000);
      `;
      const guardianCode = `
        import { runOwnerGuardedCommand } from ${JSON.stringify(supervisorUrl)};
        await runOwnerGuardedCommand({
          command: process.execPath,
          args: ["-e", ${JSON.stringify(serviceCode)}],
          cwd: ${JSON.stringify(process.cwd())},
          onStarted(child) {
            console.log(JSON.stringify({ type: "service", guardianPid: process.pid, pid: child.pid }));
            child.stdout.pipe(process.stdout);
            child.stderr.pipe(process.stderr);
          },
        });
      `;
      const hostCode = `
        const { spawn } = require("node:child_process");
        const guardian = spawn(process.execPath, ["--input-type=module", "-e", ${JSON.stringify(guardianCode)}], {
          stdio: ["pipe", "pipe", "inherit"],
          windowsHide: true,
        });
        guardian.stdout.pipe(process.stdout);
        setInterval(() => {}, 1000);
      `;
      const host = spawn(process.execPath, ["-e", hostCode], {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      const records = new Map();
      let buffer = "";
      host.stdout.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const record = JSON.parse(line);
          records.set(record.type, record);
        }
      });

      try {
        await waitUntil(
          () => records.has("service") && records.has("grandchild"),
        );
        const service = records.get("service");
        const grandchild = records.get("grandchild");
        expect(isProcessRunning(service.guardianPid)).toBe(true);
        expect(isProcessRunning(service.pid)).toBe(true);
        expect(isProcessRunning(grandchild.pid)).toBe(true);

        await forceKill(host.pid, false);
        await waitUntil(
          () =>
            !isProcessRunning(service.guardianPid) &&
            !isProcessRunning(service.pid) &&
            !isProcessRunning(grandchild.pid),
        );
      } finally {
        const service = records.get("service");
        const grandchild = records.get("grandchild");
        await forceKill(host.pid, true);
        if (service) {
          await forceKill(service.guardianPid, true);
          await forceKill(service.pid, true);
        }
        if (grandchild) {
          await forceKill(grandchild.pid, true);
        }
      }
    },
    20_000,
  );

  it("requires absolute guarded executable and working-directory paths", async () => {
    await expect(
      runOwnerGuardedCommand({ command: "node", cwd: "." }),
    ).rejects.toThrow("must be absolute paths");
  });
});
