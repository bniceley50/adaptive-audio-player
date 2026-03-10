import { spawn } from "node:child_process";
import process from "node:process";

const children = [];
let shuttingDown = false;

function spawnChild(command, args, name, extraEnv = {}) {
  const childEnv = {
    ...process.env,
    ...extraEnv,
  };
  delete childEnv.NO_COLOR;

  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: childEnv,
  });

  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      shuttingDown = true;
      for (const runningChild of children) {
        if (runningChild.pid && runningChild.pid !== child.pid) {
          runningChild.kill("SIGTERM");
        }
      }
      if (signal) {
        process.kill(process.pid, signal);
      } else {
        process.exit(code ?? 0);
      }
    }
  });

  console.log(`[dev] started ${name} (${child.pid ?? "unknown pid"})`);
  children.push(child);
}

spawnChild(
  "pnpm",
  ["exec", "next", "dev", "--hostname", "127.0.0.1", "--port", "3100"],
  "next-dev",
);
spawnChild(process.execPath, ["scripts/job-worker.mjs"], "job-worker");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    for (const child of children) {
      if (child.pid) {
        child.kill(signal);
      }
    }
  });
}
