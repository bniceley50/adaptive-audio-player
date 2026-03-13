"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  getBookCoverTheme,
  getBookInitials,
} from "@/features/reader/shared-support";
import { pushClientLibrarySyncSnapshot } from "@/lib/backend/client-sync";
import {
  clearAdaptiveAudioPlayerLocalState,
  notifyWorkspaceContextChanged,
} from "@/lib/library/local-state";
import type {
  BackendUser,
  EndedAccountSessionSummary,
  UserAccountSessionSummary,
  UserWorkspaceSummary,
} from "@/lib/backend/types";

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

function parseSessionActivity(activityLabel: string | null) {
  if (!activityLabel) {
    return null;
  }

  const listeningMatch = activityLabel.match(
    /^Listening to (.+?)(?: \((full book|sample|archived full book|archived sample)\))?$/i,
  );

  if (!listeningMatch) {
    return {
      title: null,
      detail: activityLabel,
      badge: null,
    };
  }

  const [, title, rawBadge] = listeningMatch;

  return {
    title: title?.trim() || null,
    detail: "Recent listening activity",
    badge: rawBadge
      ? rawBadge
          .replace(/^./, (character) => character.toUpperCase())
      : "Player",
  };
}


export function WorkspaceAccountCard({
  currentUser,
  currentWorkspaceId,
  linkedWorkspaces,
  accountSessions,
  endedAccountSessions,
  renderedAt,
}: {
  currentUser: BackendUser | null;
  currentWorkspaceId: string | null;
  linkedWorkspaces: UserWorkspaceSummary[];
  accountSessions: UserAccountSessionSummary[];
  endedAccountSessions: EndedAccountSessionSummary[];
  renderedAt: string;
}) {
  const router = useRouter();
  const accountFormRef = useRef<HTMLFormElement | null>(null);
  const [email, setEmail] = useState(currentUser?.email ?? "");
  const [displayName, setDisplayName] = useState(currentUser?.displayName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const bestRecoveryWorkspace =
    linkedWorkspaces.find(
      (workspace) =>
        !workspace.isCurrent &&
        workspace.syncedBookCount > 0 &&
        workspace.latestBookTitle,
    ) ?? null;

  const sessionTimeline = [
    ...accountSessions.map((session) => ({
      kind: "active" as const,
      id: session.id,
      eventAt: session.lastUsedAt,
      session,
    })),
    ...endedAccountSessions.map((session) => ({
      kind: "ended" as const,
      id: session.id,
      eventAt: session.endedAt,
      session,
    })),
  ].sort(
    (left, right) =>
      new Date(right.eventAt).getTime() - new Date(left.eventAt).getTime(),
  );

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

    return workspace.latestBookTitle
      ? `Switch and open ${workspace.latestBookTitle}`
      : "Switch here";
  }

  function formatSessionTime(value: string) {
    return new Date(value).toLocaleString();
  }

  function formatRelativeTime(value: string) {
    const diffMs = new Date(renderedAt).getTime() - new Date(value).getTime();
    const diffMinutes = Math.max(0, Math.floor(diffMs / (60 * 1000)));

    if (diffMinutes < 1) {
      return "just now";
    }

    if (diffMinutes < 60) {
      return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  }

  function formatEndedReason(reason: string) {
    switch (reason) {
      case "signed-out":
        return "Signed out";
      case "signed-out-from-account":
        return "Signed out from account";
      case "signed-out-elsewhere":
        return "Signed out elsewhere";
      case "expired":
        return "Expired";
      default:
        return "Ended";
    }
  }

  function renderLastActivity(activityLabel: string | null, activityPath: string | null) {
    if (!activityLabel) {
      return null;
    }

    const parsedActivity = parseSessionActivity(activityLabel);

    return (
      <div className="mt-3 rounded-2xl border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#f5f5f4_100%)] px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-stone-500">
              Last activity
            </p>
            {parsedActivity?.detail ? (
              <p className="mt-1 text-xs text-stone-500">{parsedActivity.detail}</p>
            ) : null}
          </div>
          {parsedActivity?.badge ? (
            <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-600">
              {parsedActivity.badge}
            </span>
          ) : null}
        </div>
        {parsedActivity?.title ? (
          <div className="mt-3 flex items-start gap-4">
            <div
              className={`flex h-20 w-16 shrink-0 flex-col justify-between overflow-hidden rounded-[1rem] border border-stone-200 bg-gradient-to-br ${getBookCoverTheme(parsedActivity.title)} p-2.5 shadow-sm`}
            >
              <p className="text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-stone-600">
                Session
              </p>
              <p className="text-lg font-semibold tracking-tight text-stone-950">
                {getBookInitials(parsedActivity.title)}
              </p>
            </div>
            <div>
              <p className="text-base font-semibold text-stone-950">
                {parsedActivity.title}
              </p>
              <p className="mt-1 text-sm text-stone-600">
                Account activity linked to this listening session.
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm font-medium text-stone-900">{activityLabel}</p>
        )}
        {activityPath ? (
          <Link
            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-stone-900 transition hover:text-stone-600"
            href={activityPath}
          >
            <span>
              {parsedActivity?.title ? "Open listening session" : activityLabel}
            </span>
            <span aria-hidden="true">↗</span>
          </Link>
        ) : (
          parsedActivity?.title ? (
            <p className="mt-2 text-sm text-stone-600">No direct resume link saved.</p>
          ) : null
        )}
      </div>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitAccountForm(new FormData(event.currentTarget));
  }

  async function submitAccountForm(formData: FormData) {
    setIsSaving(true);
    setError(null);
    const submittedDisplayName =
      formData.get("displayName")?.toString().trim() ?? "";
    const submittedEmail = formData.get("email")?.toString().trim() ?? "";

    const response = await fetch("/api/auth/account", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: submittedEmail,
        displayName: submittedDisplayName,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    if (!response.ok) {
      setError(payload?.error ?? "Unable to sign in right now.");
      setIsSaving(false);
      return;
    }

    clearAdaptiveAudioPlayerLocalState();
    notifyWorkspaceContextChanged();
    setIsSaving(false);
    window.location.assign("/");
  }

  async function handleSignOut() {
    setIsSaving(true);
    setError(null);
    await pushClientLibrarySyncSnapshot().catch(() => null);
    await fetch("/api/auth/sign-out", {
      method: "POST",
    }).catch(() => null);
    clearAdaptiveAudioPlayerLocalState();
    notifyWorkspaceContextChanged();
    window.location.assign("/");
  }

  async function handleSwitchWorkspace(
    workspaceId: string,
    redirectPath = "/",
  ) {
    setIsSaving(true);
    setError(null);
    await pushClientLibrarySyncSnapshot().catch(() => null);
    const response = await fetch("/api/auth/switch-workspace", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ workspaceId }),
    }).catch(() => null);

    if (!response || !response.ok) {
      setError("Unable to switch workspaces right now.");
      setIsSaving(false);
      return;
    }

    clearAdaptiveAudioPlayerLocalState();
    notifyWorkspaceContextChanged();
    window.location.assign(redirectPath);
  }

  async function handleRevokeSession(sessionId: string) {
    setIsSaving(true);
    setError(null);
    const response = await fetch("/api/auth/sessions/revoke", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ sessionId }),
    }).catch(() => null);

    if (!response || !response.ok) {
      const payload = !response
        ? null
        : ((await response.json().catch(() => null)) as
            | { error?: string }
            | null);
      setError(payload?.error ?? "Unable to revoke that session right now.");
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    router.refresh();
  }

  async function handleRevokeOtherSessions() {
    setIsSaving(true);
    setError(null);
    const response = await fetch("/api/auth/sessions/revoke-others", {
      method: "POST",
    }).catch(() => null);

    if (!response || !response.ok) {
      const payload = !response
        ? null
        : ((await response.json().catch(() => null)) as
            | { error?: string }
            | null);
      setError(payload?.error ?? "Unable to sign out other sessions right now.");
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    router.refresh();
  }

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 bg-[linear-gradient(135deg,#f6eed8_0%,#fcfaf5_48%,#edf3ff_100%)] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              Account security
            </p>
            <h2 className="mt-2 text-lg font-semibold text-stone-900">Account</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Sign in with an email to attach this workspace to a real account
              instead of only a browser-local workspace.
            </p>
          </div>
          <span className="rounded-full border border-white/80 bg-white/80 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-600 backdrop-blur">
            {currentUser ? "signed in" : "anonymous"}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <article className="rounded-2xl border border-white/80 bg-white/75 px-4 py-4 backdrop-blur">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
              Active sessions
            </p>
            <p className="mt-2 text-2xl font-semibold text-stone-950">
              {accountSessions.length}
            </p>
            <p className="mt-1 text-sm text-stone-600">
              Browsers currently attached to this account.
            </p>
          </article>
          <article className="rounded-2xl border border-white/80 bg-white/75 px-4 py-4 backdrop-blur">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
              Linked workspaces
            </p>
            <p className="mt-2 text-2xl font-semibold text-stone-950">
              {linkedWorkspaces.length}
            </p>
            <p className="mt-1 text-sm text-stone-600">
              Workspaces carrying synced books and jobs.
            </p>
          </article>
          <article className="rounded-2xl border border-white/80 bg-white/75 px-4 py-4 backdrop-blur">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
              Recent security events
            </p>
            <p className="mt-2 text-2xl font-semibold text-stone-950">
              {endedAccountSessions.length}
            </p>
            <p className="mt-1 text-sm text-stone-600">
              Ended sessions retained for quick audit context.
            </p>
          </article>
        </div>
      </div>

      <div className="p-6">
        {currentUser ? (
          <div className="rounded-[1.6rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-5 text-sm text-stone-700 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-stone-950 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white">
                Identity
              </span>
              <p className="text-sm text-stone-500">
                This is the account currently attached to the active workspace.
              </p>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                  Signed-in identity
                </p>
                <p className="mt-2 text-lg font-semibold text-stone-950">
                  {currentUser.displayName}
                </p>
                <p className="mt-1 text-stone-700">{currentUser.email}</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                  Current workspace
                </p>
                <p className="mt-2 font-medium text-stone-950">
                  {currentWorkspaceId?.slice(0, 18) ?? "anonymous"}…
                </p>
              </div>
            </div>
            <button
              className="mt-5 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:text-stone-950"
              type="button"
              disabled={isSaving}
              onClick={handleSignOut}
            >
              Sign out
            </button>
          </div>
        ) : null}

        {currentUser &&
        bestRecoveryWorkspace &&
        linkedWorkspaces.some(
          (workspace) => workspace.isCurrent && workspace.syncedBookCount === 0,
        ) ? (
          <div className="mt-5 rounded-[1.6rem] border border-amber-200 bg-[linear-gradient(135deg,#fff5d5_0%,#fffaf0_100%)] p-5 text-sm text-amber-950 shadow-sm">
            <div className="flex items-start gap-4">
              {bestRecoveryWorkspace.latestBookTitle ? (
                <div
                  className={`flex h-24 w-20 shrink-0 flex-col justify-between overflow-hidden rounded-[1.15rem] border border-amber-200 bg-gradient-to-br ${bestRecoveryWorkspace.latestBookCoverTheme ?? getBookCoverTheme(bestRecoveryWorkspace.latestBookTitle)} p-3 shadow-sm`}
                >
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-amber-900/70">
                    {bestRecoveryWorkspace.latestBookCoverLabel ?? "Resume"}
                  </p>
                  <p className="text-xl font-semibold tracking-tight text-stone-950">
                    {bestRecoveryWorkspace.latestBookCoverGlyph ??
                      getBookInitials(bestRecoveryWorkspace.latestBookTitle)}
                  </p>
                </div>
              ) : null}
              <div>
                <p className="font-medium">
                  This workspace is empty, but your account already has synced books.
                </p>
                <p className="mt-1 text-amber-900">
                  Resume from{" "}
                  <span className="font-semibold">
                    {bestRecoveryWorkspace.latestBookTitle}
                  </span>{" "}
                  in your latest linked workspace.
                </p>
                {bestRecoveryWorkspace.latestBookGenreLabel ? (
                  <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-amber-900/80">
                    {bestRecoveryWorkspace.latestBookGenreLabel}
                  </p>
                ) : null}
              </div>
            </div>
            <button
              className="mt-4 rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-stone-800"
              type="button"
              disabled={isSaving}
              onClick={() =>
                handleSwitchWorkspace(
                  bestRecoveryWorkspace.workspaceId,
                  bestRecoveryWorkspace.latestResumePath ?? "/",
                )
              }
            >
              {bestRecoveryWorkspace.latestPlayableArtifactKind
                ? "Resume latest listening session"
                : "Resume latest book"}
            </button>
          </div>
        ) : null}

        {currentUser && sessionTimeline.length > 0 ? (
          <div className="mt-6 rounded-[1.75rem] border border-stone-200 bg-[linear-gradient(180deg,#fcfaf6_0%,#f7f5f1_100%)] p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-600">
                    Security
                  </span>
                  <p className="text-sm text-stone-500">
                    See where this account is signed in and what changed recently.
                  </p>
                </div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Session timeline
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
                  A chronological security feed for this account: current browsers,
                  other active sessions, and recently ended sessions.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                  {accountSessions.length} active
                </span>
                <span className="rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                  {endedAccountSessions.length} ended
                </span>
                {accountSessions.some((session) => !session.isCurrent) ? (
                  <button
                    className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:text-stone-950"
                    type="button"
                    disabled={isSaving}
                    onClick={handleRevokeOtherSessions}
                  >
                    Sign out other sessions
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {sessionTimeline.map((entry, index) => (
                <div
                  key={`${entry.kind}-${entry.id}`}
                  className="relative pl-8"
                >
                  {index < sessionTimeline.length - 1 ? (
                    <div className="absolute bottom-[-1.25rem] left-[0.93rem] top-8 w-px bg-stone-200" />
                  ) : null}
                  <div
                    className={`absolute left-0 top-5 flex h-8 w-8 items-center justify-center rounded-full border ${
                      entry.kind === "active"
                        ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                        : "border-stone-200 bg-white text-stone-500"
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-current" />
                  </div>
                  <div className="overflow-hidden rounded-[1.5rem] border border-stone-200 bg-white px-5 py-5 text-sm text-stone-700 shadow-sm">
                    {entry.kind === "active" ? (
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-3">
                            <p className="font-medium text-stone-950">
                              {entry.session.isCurrent
                                ? "Current session"
                                : "Signed-in session"}
                            </p>
                            <span
                              className={`rounded-full px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] ${
                                entry.session.isCurrent
                                  ? "bg-stone-950 text-white"
                                  : "border border-stone-200 bg-stone-50 text-stone-500"
                              }`}
                            >
                              {entry.session.isCurrent ? "Current" : "Active"}
                            </span>
                            <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                              {formatRelativeTime(entry.session.lastUsedAt)}
                            </span>
                          </div>
                          <p className="mt-3 text-base font-medium text-stone-900">
                            {entry.session.label ?? "Unknown browser"}
                          </p>
                          {renderLastActivity(
                            entry.session.lastActivityLabel,
                            entry.session.lastActivityPath,
                          )}
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-stone-500">
                            <p>Last used {formatSessionTime(entry.session.lastUsedAt)}</p>
                            <p>Expires {formatSessionTime(entry.session.expiresAt)}</p>
                          </div>
                        </div>
                        {entry.session.isCurrent ? null : (
                          <button
                            className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:text-stone-950"
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleRevokeSession(entry.session.id)}
                          >
                            Sign out this session
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                            Ended
                          </span>
                          <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                            {formatRelativeTime(entry.session.endedAt)}
                          </span>
                        </div>
                        <p className="mt-3 text-base font-medium text-stone-900">
                          {formatEndedReason(entry.session.endedReason)}{" "}
                          <span className="font-normal text-stone-600">
                            from {entry.session.label ?? "Unknown browser"}
                          </span>
                        </p>
                        {renderLastActivity(
                          entry.session.lastActivityLabel,
                          entry.session.lastActivityPath,
                        )}
                        <p className="mt-2 text-stone-500">
                          Ended {formatSessionTime(entry.session.endedAt)}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {currentUser && linkedWorkspaces.length > 0 ? (
          <div className="mt-6 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-stone-100 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-600">
                Connected workspaces
              </span>
              <p className="text-sm text-stone-500">
                Jump between synced environments and recover the right listening state fast.
              </p>
            </div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">
              Linked workspaces
            </h3>
            {linkedWorkspaces.map((workspace) => {
              const artifactLabel = formatArtifactLabel(
                workspace.latestPlayableArtifactKind,
              );
              const workspaceState = describeWorkspaceState(workspace);

              return (
                <div
                  key={workspace.workspaceId}
                  className="rounded-[1.5rem] border border-stone-200 bg-stone-50/80 px-5 py-5 text-sm text-stone-700 shadow-sm"
                >
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
                            {workspace.latestBookCoverGlyph ??
                              getBookInitials(workspace.latestBookTitle)}
                          </p>
                        </div>
                      ) : null}
                      <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="font-medium text-stone-950">
                          {workspace.isCurrent
                            ? "Current workspace"
                            : "Linked workspace"}
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
                      <p className="mt-2 text-stone-600">
                        {workspace.workspaceId.slice(0, 24)}…
                      </p>
                      <p className="mt-1 text-stone-500">{workspaceState.detail}</p>
                      <p className="mt-1 text-stone-500">
                        {workspace.syncedBookCount} synced book
                        {workspace.syncedBookCount === 1 ? "" : "s"}
                        {workspace.lastSyncedAt
                          ? ` · last synced ${new Date(workspace.lastSyncedAt).toLocaleString()}`
                          : ""}
                      </p>
                      {workspace.latestBookTitle ? (
                        <p className="mt-1 text-stone-500">
                          Latest book: {workspace.latestBookTitle}
                        </p>
                      ) : null}
                      {workspace.latestSessionBookTitle ? (
                        <p className="mt-1 text-stone-500">
                          Latest session: {workspace.latestSessionBookTitle}
                          {workspace.latestSessionChapterIndex !== null
                            ? ` · Chapter ${workspace.latestSessionChapterIndex + 1}`
                            : ""}
                          {formatPlaybackTime(
                            workspace.latestSessionProgressSeconds,
                          )
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
                          handleSwitchWorkspace(
                            workspace.workspaceId,
                            workspace.latestResumePath ?? "/",
                          )
                        }
                      >
                        {getWorkspaceActionLabel(workspace)}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        <form
          ref={accountFormRef}
          className="mt-6 grid gap-5 rounded-[1.6rem] border border-stone-200 bg-[linear-gradient(135deg,#fafaf9_0%,#ffffff_42%,#eef4ff_100%)] p-5 shadow-sm"
          onSubmit={handleSubmit}
        >
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-stone-100 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-600">
                {currentUser ? "Account details" : "Identity"}
              </span>
              <p className="text-sm text-stone-500">
                {currentUser
                  ? "Keep the signed-in identity clean so sessions, jobs, and linked workspaces stay attributable."
                  : "Turn this browser workspace into a portable account you can sign back into later."}
              </p>
            </div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
              {currentUser ? "Manage your identity" : "Create your account"}
            </p>
            <p className="mt-2 text-sm text-stone-600">
              {currentUser
                ? "Update the name and email attached to this library so recovery, sync, and security timelines stay understandable."
                : "Create a portable identity so imports, generated renders, and listening history can travel across workspaces."}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <article className="rounded-[1.3rem] border border-white/80 bg-white/80 px-4 py-4 shadow-sm backdrop-blur">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                1. Claim this library
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Attach this workspace to a real identity instead of leaving it as browser-only state.
              </p>
            </article>
            <article className="rounded-[1.3rem] border border-white/80 bg-white/80 px-4 py-4 shadow-sm backdrop-blur">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                2. Keep progress portable
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Sync listening sessions, jobs, and book taste choices across linked workspaces.
              </p>
            </article>
            <article className="rounded-[1.3rem] border border-white/80 bg-white/80 px-4 py-4 shadow-sm backdrop-blur">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                3. Control access
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Review active sessions, revoke stale browsers, and understand recent security events.
              </p>
            </article>
          </div>
          <div>
            <label
              className="block text-sm font-medium text-stone-900"
              htmlFor="account-name"
            >
              Display name
            </label>
            <input
              id="account-name"
              name="displayName"
              className="mt-2 w-full rounded-[1.25rem] border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 outline-none transition focus:border-stone-400"
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          <div>
            <label
              className="block text-sm font-medium text-stone-900"
              htmlFor="account-email"
            >
              Email
            </label>
            <input
              id="account-email"
              name="email"
              className="mt-2 w-full rounded-[1.25rem] border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 outline-none transition focus:border-stone-400"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <p className="mt-2 text-xs leading-5 text-stone-500">
              Use the same email later to reconnect to this account from another browser or device.
            </p>
          </div>
          {error ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-stone-500">
              {currentUser
                ? "Updating this profile keeps account ownership and recovery details current."
                : "Creating an account signs this browser in immediately and links future sync to that identity."}
            </p>
            <button
              className="rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-stone-800 disabled:bg-stone-300 disabled:text-stone-500"
              type="button"
              disabled={isSaving}
              onClick={() => {
                if (!accountFormRef.current) {
                  return;
                }

                void submitAccountForm(new FormData(accountFormRef.current));
              }}
            >
              {currentUser ? "Save account changes" : "Create account and sync this library"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
