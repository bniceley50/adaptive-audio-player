import { spawn } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

async function exists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function uvManagedCandidates(environment = process.env) {
  if (process.platform !== "win32" || !environment.APPDATA) {
    return [];
  }

  const root = path.join(environment.APPDATA, "uv", "python");
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name.startsWith("cpython-3.11-") &&
        entry.name.endsWith("-x86_64-none"),
    )
    .map((entry) => path.join(root, entry.name, "python.exe"));
}

function runCaptured(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output = `${output}${chunk}`.slice(-4_096);
    });
    child.stderr.on("data", (chunk) => {
      output = `${output}${chunk}`.slice(-4_096);
    });
    child.once("error", () => resolve({ code: null, output }));
    child.once("close", (code) => resolve({ code, output }));
  });
}

export async function resolveChatterboxInstallerPython(
  environment = process.env,
) {
  const configured = environment.ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_PYTHON?.trim();
  const candidates = configured
    ? [configured]
    : [
        ...(await uvManagedCandidates(environment)),
        ...(process.platform === "win32" ? ["python"] : ["python3.11", "python3"]),
      ];

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && !(await exists(candidate))) {
      continue;
    }
    const probe = await runCaptured(candidate, ["--version"]);
    if (probe.code === 0 && /Python 3\.11(?:\.|\s)/.test(probe.output)) {
      return candidate;
    }
  }

  throw new Error(
    "Python 3.11 is required for High Quality narration. Install Python 3.11 or set ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_PYTHON to its absolute executable path.",
  );
}

function runInteractive(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Chatterbox installer exited with code ${code ?? "unknown"}.`));
      }
    });
  });
}

export async function main(args = process.argv.slice(2)) {
  const python = await resolveChatterboxInstallerPython();
  await runInteractive(python, [
    path.join(repoRoot, "chatterbox_sidecar", "install_runtime.py"),
    ...args,
  ]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
