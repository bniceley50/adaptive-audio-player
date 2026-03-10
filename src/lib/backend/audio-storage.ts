import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

function resolveAudioRoot() {
  return path.join(process.cwd(), "data", "generated-audio");
}

function ensureAudioRoot() {
  const root = resolveAudioRoot();
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true });
  }

  return root;
}

export function writeGeneratedAudioAsset(input: {
  workspaceId: string;
  bookId: string;
  kind: string;
  extension: string;
  data: Buffer;
}) {
  const root = ensureAudioRoot();
  const workspaceDir = path.join(root, input.workspaceId);
  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true });
  }

  const fileName = `${input.bookId}-${input.kind}-${Date.now()}-${randomUUID()}.${input.extension}`;
  const absolutePath = path.join(workspaceDir, fileName);
  writeFileSync(absolutePath, input.data);

  return {
    absolutePath,
    relativePath: path.relative(process.cwd(), absolutePath),
  };
}

export function readGeneratedAudioAsset(relativePath: string) {
  const absolutePath = path.isAbsolute(relativePath)
    ? relativePath
    : path.join(process.cwd(), relativePath);

  if (!existsSync(absolutePath)) {
    return null;
  }

  return {
    absolutePath,
    data: readFileSync(absolutePath),
  };
}
