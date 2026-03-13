"use client";

import Link from "next/link";

import {
  getBookCoverTheme,
  getBookInitials,
} from "@/features/reader/shared-support";
import type {
  EndedAccountSessionSummary,
  UserAccountSessionSummary,
} from "@/lib/backend/types";

function formatSessionTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatRelativeTime(value: string, renderedAt: string) {
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
    badge: rawBadge ? rawBadge.replace(/^./, (character) => character.toUpperCase()) : "Player",
  };
}

function SessionActivity({
  activityLabel,
  activityPath,
}: {
  activityLabel: string | null;
  activityPath: string | null;
}) {
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
            <p className="text-base font-semibold text-stone-950">{parsedActivity.title}</p>
            <p className="mt-1 text-sm text-stone-600">
              Continue from the most recent listening event for this session.
            </p>
            {activityPath ? (
              <Link
                className="mt-3 inline-flex items-center rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:text-stone-950"
                href={activityPath}
              >
                Resume activity
              </Link>
            ) : null}
          </div>
        </div>
      ) : activityPath ? (
        <Link
          className="mt-3 inline-flex items-center rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:text-stone-950"
          href={activityPath}
        >
          Open last activity
        </Link>
      ) : null}
    </div>
  );
}

type SessionTimelineEntry =
  | {
      kind: "active";
      id: string;
      eventAt: string;
      session: UserAccountSessionSummary;
    }
  | {
      kind: "ended";
      id: string;
      eventAt: string;
      session: EndedAccountSessionSummary;
    };

export function AccountSessionTimeline({
  accountSessions,
  endedAccountSessions,
  renderedAt,
  isSaving,
  onRevokeOtherSessions,
  onRevokeSession,
}: {
  accountSessions: UserAccountSessionSummary[];
  endedAccountSessions: EndedAccountSessionSummary[];
  renderedAt: string;
  isSaving: boolean;
  onRevokeOtherSessions: () => void;
  onRevokeSession: (sessionId: string) => void;
}) {
  const sessionTimeline: SessionTimelineEntry[] = [
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
    (left, right) => new Date(right.eventAt).getTime() - new Date(left.eventAt).getTime(),
  );

  if (sessionTimeline.length === 0) {
    return null;
  }

  return (
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
            A chronological security feed for this account: current browsers, other active
            sessions, and recently ended sessions.
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
              onClick={onRevokeOtherSessions}
            >
              Sign out other sessions
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {sessionTimeline.map((entry, index) => (
          <div key={`${entry.kind}-${entry.id}`} className="relative pl-8">
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
                        {entry.session.isCurrent ? "Current session" : "Signed-in session"}
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
                        {formatRelativeTime(entry.session.lastUsedAt, renderedAt)}
                      </span>
                    </div>
                    <p className="mt-3 text-base font-medium text-stone-900">
                      {entry.session.label ?? "Unknown browser"}
                    </p>
                    <SessionActivity
                      activityLabel={entry.session.lastActivityLabel}
                      activityPath={entry.session.lastActivityPath}
                    />
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
                      onClick={() => onRevokeSession(entry.session.id)}
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
                      {formatRelativeTime(entry.session.endedAt, renderedAt)}
                    </span>
                  </div>
                  <p className="mt-3 text-base font-medium text-stone-900">
                    {formatEndedReason(entry.session.endedReason)}{" "}
                    <span className="font-normal text-stone-600">
                      from {entry.session.label ?? "Unknown browser"}
                    </span>
                  </p>
                  <SessionActivity
                    activityLabel={entry.session.lastActivityLabel}
                    activityPath={entry.session.lastActivityPath}
                  />
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
  );
}
