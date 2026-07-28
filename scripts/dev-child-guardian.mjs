import path from "node:path";
import process from "node:process";

import { runOwnerGuardedCommand } from "../desktop/supervisor.mjs";

export const devGuardianReadyPrefix = "AAP_DEV_GUARDIAN_READY ";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateStartConfig(value) {
  if (
    !isPlainObject(value) ||
    typeof value.command !== "string" ||
    !path.isAbsolute(value.command) ||
    typeof value.cwd !== "string" ||
    !path.isAbsolute(value.cwd) ||
    typeof value.component !== "string" ||
    !value.component.trim() ||
    !Array.isArray(value.args) ||
    !value.args.every((argument) => typeof argument === "string") ||
    !isPlainObject(value.env)
  ) {
    throw new Error("The development guardian received an invalid start command.");
  }

  return value;
}

export function readGuardianStartConfig(input = process.stdin) {
  return new Promise((resolve, reject) => {
    let buffer = "";

    function cleanup() {
      input.off("data", onData);
      input.off("end", onEnd);
      input.off("error", onError);
    }

    function onEnd() {
      cleanup();
      reject(new Error("The development guardian owner closed before startup."));
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    function onData(chunk) {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) {
        if (buffer.length > 512 * 1024) {
          cleanup();
          reject(new Error("The development guardian start command is too large."));
        }
        return;
      }

      cleanup();
      try {
        resolve(validateStartConfig(JSON.parse(buffer.slice(0, newlineIndex))));
      } catch (error) {
        reject(error);
      }
    }

    input.setEncoding("utf8");
    input.on("data", onData);
    input.once("end", onEnd);
    input.once("error", onError);
    input.resume();
  });
}

export async function runDevelopmentGuardian(input = process.stdin) {
  const config = await readGuardianStartConfig(input);
  const outcome = await runOwnerGuardedCommand({
    args: config.args,
    command: config.command,
    cwd: config.cwd,
    env: config.env,
    ownerInput: input,
    onStarted(child) {
      child.stdout?.pipe(process.stdout);
      child.stderr?.pipe(process.stderr);
      process.stdout.write(
        `${devGuardianReadyPrefix}${JSON.stringify({
          component: config.component,
          pid: child.pid,
          type: "adaptive-audio-player-dev-guardian-ready",
        })}\n`,
      );
    },
  });

  if (outcome.type === "child-exit") {
    process.exitCode =
      typeof outcome.details.code === "number" ? outcome.details.code : 1;
  }
  return outcome;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  void runDevelopmentGuardian().catch((error) => {
    console.error(
      `[dev guardian] ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
  });
}
