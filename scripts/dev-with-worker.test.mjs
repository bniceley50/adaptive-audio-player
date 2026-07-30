import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { devGuardianReadyPrefix } from "./dev-child-guardian.mjs";
import {
  assertLoopbackPortAvailable,
  prepareDevelopmentConfig,
  readDevelopmentConfig,
} from "./dev-with-worker.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const guardianPath = path.join(
  repositoryRoot,
  "scripts",
  "dev-child-guardian.mjs",
);
const testServiceReadyPrefix = "AAP_TEST_SERVICE_READY ";

function closeServer(server) {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

function waitForPrefixedJson(stream, prefix, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${prefix.trim()}.`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      stream.off("data", onData);
      stream.off("error", onError);
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    function onData(chunk) {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith(prefix)) {
          cleanup();
          resolve(JSON.parse(line.slice(prefix.length)));
          return;
        }
      }
    }

    stream.on("data", onData);
    stream.once("error", onError);
  });
}

function waitForExit(child, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    const timer = setTimeout(
      () => reject(new Error("Timed out waiting for guarded process exit.")),
      timeoutMs,
    );
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function forceKill(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || !isProcessRunning(pid)) {
    return;
  }
  if (process.platform !== "win32") {
    process.kill(pid, "SIGKILL");
    return;
  }
  const taskkill = path.join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "taskkill.exe",
  );
  const killer = spawn(taskkill, ["/PID", String(pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true,
  });
  await waitForExit(killer);
}

describe("development runtime supervision", () => {
  it("selects an ephemeral TTS port and preflights Next.js before spawning", async () => {
    const assertPortAvailable = vi.fn(async () => undefined);
    const findAvailablePort = vi.fn(async () => 43_210);

    const config = await prepareDevelopmentConfig(readDevelopmentConfig({}), {
      assertPortAvailable,
      findAvailablePort,
    });

    expect(assertPortAvailable).toHaveBeenCalledOnce();
    expect(assertPortAvailable).toHaveBeenCalledWith(
      "127.0.0.1",
      3_100,
      "Next.js",
    );
    expect(findAvailablePort).toHaveBeenCalledWith("127.0.0.1");
    expect(config.ttsOrigin).toBe("http://127.0.0.1:43210");
    expect(config.ttsHealthUrl).toBe("http://127.0.0.1:43210/health");
  });

  it("preflights an explicit loopback TTS port and rejects remote URLs", async () => {
    const assertPortAvailable = vi.fn(async () => undefined);
    const findAvailablePort = vi.fn(async () => 43_210);
    const configured = readDevelopmentConfig({
      ADAPTIVE_AUDIO_PLAYER_TTS_URL: "http://localhost:7865/custom",
    });

    const config = await prepareDevelopmentConfig(configured, {
      assertPortAvailable,
      findAvailablePort,
    });

    expect(assertPortAvailable).toHaveBeenNthCalledWith(
      2,
      "localhost",
      7_865,
      "Local TTS",
    );
    expect(findAvailablePort).not.toHaveBeenCalled();
    expect(config.ttsOrigin).toBe("http://localhost:7865");
    expect(() =>
      readDevelopmentConfig({
        ADAPTIVE_AUDIO_PLAYER_TTS_URL: "https://example.com:7865",
      }),
    ).toThrow("must be an http:// loopback URL");
  });

  it("fails before startup when a requested loopback port is already owned", async () => {
    const server = net.createServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen({ host: "127.0.0.1", port: 0 }, resolve);
    });
    const address = server.address();
    const port = address && typeof address === "object" ? address.port : null;

    try {
      await expect(
        assertLoopbackPortAvailable("127.0.0.1", port, "Test service"),
      ).rejects.toThrow("is already in use");
    } finally {
      await closeServer(server);
    }
  });

  it.runIf(process.platform === "win32")(
    "kills the guarded service when its supervisor pipe closes",
    async () => {
      const serviceCode = `
        process.stdout.write(${JSON.stringify(testServiceReadyPrefix)} + JSON.stringify({ pid: process.pid }) + "\\n");
        setInterval(() => {}, 1000);
      `;
      const guardian = spawn(process.execPath, [guardianPath], {
        cwd: repositoryRoot,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      const guardianReady = waitForPrefixedJson(
        guardian.stdout,
        devGuardianReadyPrefix,
      );
      const serviceReady = waitForPrefixedJson(
        guardian.stdout,
        testServiceReadyPrefix,
      );
      let servicePid = null;

      try {
        guardian.stdin.write(
          `${JSON.stringify({
            args: ["-e", serviceCode],
            command: process.execPath,
            component: "test service",
            cwd: repositoryRoot,
            env: process.env,
          })}\n`,
        );
        const [guardianRecord, serviceRecord] = await Promise.all([
          guardianReady,
          serviceReady,
        ]);
        servicePid = serviceRecord.pid;
        expect(guardianRecord.component).toBe("test service");
        expect(isProcessRunning(servicePid)).toBe(true);

        guardian.stdin.end();
        await expect(waitForExit(guardian)).resolves.toEqual({
          code: 0,
          signal: null,
        });
        expect(isProcessRunning(servicePid)).toBe(false);
      } finally {
        guardian.stdin.destroy();
        await forceKill(servicePid);
        await forceKill(guardian.pid);
      }
    },
    15_000,
  );
});
