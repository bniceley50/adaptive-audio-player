"use client";

import {
  getBookCoverTheme,
  getBookInitials,
} from "@/features/reader/shared-support";
import type { UserWorkspaceSummary } from "@/lib/backend/types";

function formatPlaybackTime(totalSeconds: number | null) {
  if (totalSeconds === null) {
    return null;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatArtifactLabel(kind: UserWorkspaceSummary["latestPlayableArtifactKind"]) {
  switch (kind) {
    case "full-book-generation":
      return "Full book ready";
    case "sample-generation":
      return "Sample ready";
    default:
      return null;
  }
}

function describeWorkspaceState(workspace: UserWorkspaceSummary) {
  if (workspace.latestSessionBookTitle) {
    return {
      label: "Ready to resume",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
      detail: "A synced listening session is waiting to be resumed.",
    };
  }

  if (workspace.latestPlayableArtifactKind === "full-book-generation") {
    return {
      label: "Ready to listen",
      tone: "border-sky-200 bg-sky-50 text-sky-700",
      detail: "A current full-book render is available now.",
    };
  }

  if (workspace.latestPlayableArtifactKind === "sample-generation") {
    return {
      label: "Sample ready",
      tone: "border-violet-200 bg-violet-50 text-violet-700",
      detail: "A generated sample is ready to review.",
    };
  }

  if (workspace.syncedBookCount > 0) {
    return {
      label: "Needs setup",
      tone: "border-amber-200 bg-amber-50 text-amber-700",
      detail: "Books are synced, but no playable render is ready yet.",
    };
  }

  return {
    label: "Empty",
    tone: "border-stone-200 bg-stone-100 text-stone-600",
    detail: "This workspace has no synced titles yet.",
  };
}

function getWorkspaceActionLabel(workspace: UserWorkspaceSummary) {
  if (workspace.latestPlayableArtifactKind === "full-book-generation") {
    return workspace.latestBookTitle
      ? `Switch and continue ${workspace.latestBookTitle}`
      : "Switch and continue listening";
  }

  if (workspace.latestPlayableArtifactKind === "sample-generation") {
    return workspace.latestBookTitle
      ? `Switch and resume sample for ${workspace.latestBookTitle}`
      : "Switch and resume sample";
  }

  return workspace.latestBookTitle ? `Switch and open ${workspace.latestBookTitle}` : "Switch here";
}

export function LinkedWorkspaceCard({
  workspace,
  isSaving,
  onSwitchWorkspace,
}: {
  workspace: UserWorkspaceSummary;
  isSaving: boolean;
  onSwitchWorkspace: (workspaceId: string, redirectPath?: string) => void;
}) {
  const artifactLabel = formatArtifactLabel(workspace.latestPlayableArtifactKind);
  const workspaceState = describeWorkspaceState(workspace);

  return (
    <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50/80 px-5 py-5 text-sm text-stone-700 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          {workspace.latestBookTitle ? (
            <div
              className={`flex h-24 w-20 shrink-0 flex-col justify-between overflow-hidden rounded-[1.15rem] border border-stone-200 bg-gradient-to-br ${workspace.latestBookCoverTheme ?? getBookCoverTheme(workspace.latestBookTitle)} p-3 shadow-sm`}
            >
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-stone-600">
                {workspace.latestBookCoverLabel ?? "Library"}
              </p>
              <p className="text-xl font-semibold tracking-tight text-stone-950">
                {workspace.latestBookCoverGlyph ?? getBookInitials(workspace.latestBookTitle)}
              </p>
            </div>
          ) : null}
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-medium text-stone-950">
                {workspace.isCurrent ? "Current workspace" : "Linked workspace"}
              </p>
              <span
                className={`rounded-full border px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] ${workspaceState.tone}`}
              >
                {workspaceState.label}
              </span>
              <span
                className={`rounded-full px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] ${
                  workspace.isCurrent
                    ? "bg-stone-950 text-white"
                    : "border border-stone-200 bg-white text-stone-500"
                }`}
              >
                {workspace.isCurrent ? "Active" : "Linked"}
              </span>
              {artifactLabel ? (
                <span className="rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                  {artifactLabel}
                </span>
              ) : null}
              {workspace.latestBookGenreLabel ? (
                <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-fuchsia-700">
                  {workspace.latestBookGenreLabel}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-stone-600">{workspace.workspaceId.slice(0, 24)}…</p>
            <p className="mt-1 text-stone-500">{workspaceState.detail}</p>
            <p className="mt-1 text-stone-500">
              {workspace.syncedBookCount} synced book
              {workspace.syncedBookCount === 1 ? "" : "s"}
              {workspace.lastSyncedAt
                ? ` · last synced ${new Date(workspace.lastSyncedAt).toLocaleString()}`
                : ""}
            </p>
            {workspace.latestBookTitle ? (
              <p className="mt-1 text-stone-500">Latest book: {workspace.latestBookTitle}</p>
            ) : null}
            {workspace.latestSessionBookTitle ? (
              <p className="mt-1 text-stone-500">
                Latest session: {workspace.latestSessionBookTitle}
                {workspace.latestSessionChapterIndex !== null
                  ? ` · Chapter ${workspace.latestSessionChapterIndex + 1}`
                  : ""}
                {formatPlaybackTime(workspace.latestSessionProgressSeconds)
                  ? ` · ${formatPlaybackTime(workspace.latestSessionProgressSeconds)}`
                  : ""}
              </p>
            ) : null}
          </div>
        </div>
        {workspace.isCurrent ? null : (
          <button
            className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:text-stone-950"
            type="button"
            disabled={isSaving}
            onClick={() =>
              onSwitchWorkspace(workspace.workspaceId, workspace.latestResumePath ?? "/")
            }
          >
            {getWorkspaceActionLabel(workspace)}
          </button>
        )}
      </div>
    </div>
  );
}
