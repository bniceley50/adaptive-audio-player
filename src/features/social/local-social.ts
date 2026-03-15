"use client";

import type {
  CircleMembershipRecord,
  PromotedSocialMomentRecord,
  SavedListeningEditionRecord,
  SyncedSocialState,
} from "@/lib/types/social";

export const socialStateChangedEvent = "adaptive-audio-player:social-state-changed";

const savedEditionsStorageKey = "adaptive-audio-player.social.saved-editions";
const circleMembershipsStorageKey =
  "adaptive-audio-player.social.circle-memberships";
const promotedMomentsStorageKey = "adaptive-audio-player.social.promoted-moments";

function emitSocialStateChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(socialStateChangedEvent));
}

function readJsonValue<T>(storageKey: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonValue<T>(storageKey: string, value: T, emit = true) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(value));
  if (emit) {
    emitSocialStateChanged();
  }
}

export function readSavedListeningEditions(): SavedListeningEditionRecord[] {
  return readJsonValue<SavedListeningEditionRecord[]>(savedEditionsStorageKey, []);
}

export function readCircleMemberships(): CircleMembershipRecord[] {
  return readJsonValue<CircleMembershipRecord[]>(circleMembershipsStorageKey, []);
}

export function readPromotedSocialMoments(): PromotedSocialMomentRecord[] {
  return readJsonValue<PromotedSocialMomentRecord[]>(promotedMomentsStorageKey, []);
}

export function readSocialStateSnapshot(): SyncedSocialState {
  return {
    savedEditions: readSavedListeningEditions(),
    circleMemberships: readCircleMemberships(),
    promotedMoments: readPromotedSocialMoments(),
  };
}

export function writeSocialStateSnapshot(snapshot: SyncedSocialState | null) {
  const nextSnapshot = snapshot ?? {
    savedEditions: [],
    circleMemberships: [],
    promotedMoments: [],
  };

  writeJsonValue(savedEditionsStorageKey, nextSnapshot.savedEditions, false);
  writeJsonValue(circleMembershipsStorageKey, nextSnapshot.circleMemberships, false);
  writeJsonValue(promotedMomentsStorageKey, nextSnapshot.promotedMoments, true);
}

export function toggleSavedListeningEdition(editionId: string) {
  const current = readSavedListeningEditions();
  const existing = current.find((entry) => entry.editionId === editionId);
  const next = existing
    ? current.filter((entry) => entry.editionId !== editionId)
    : [
        {
          editionId,
          savedAt: new Date().toISOString(),
          lastUsedAt: null,
        },
        ...current,
      ];

  writeJsonValue(savedEditionsStorageKey, next);
  return next;
}

export function touchSavedListeningEdition(editionId: string) {
  const current = readSavedListeningEditions();
  const existing = current.find((entry) => entry.editionId === editionId);
  if (!existing) {
    const next = [
      {
        editionId,
        savedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      },
      ...current,
    ];
    writeJsonValue(savedEditionsStorageKey, next);
    return next;
  }

  const next = current.map((entry) =>
    entry.editionId === editionId
      ? { ...entry, lastUsedAt: new Date().toISOString() }
      : entry,
  );
  writeJsonValue(savedEditionsStorageKey, next);
  return next;
}

export function joinCircleMembership(circleId: string) {
  const current = readCircleMemberships();
  const existing = current.find((entry) => entry.circleId === circleId);
  const next = existing
    ? current
    : [
        {
          circleId,
          joinedAt: new Date().toISOString(),
          lastOpenedAt: null,
          shareCount: 0,
        },
        ...current,
      ];

  if (!existing) {
    writeJsonValue(circleMembershipsStorageKey, next);
  }

  return next;
}

export function leaveCircleMembership(circleId: string) {
  const next = readCircleMemberships().filter((entry) => entry.circleId !== circleId);
  writeJsonValue(circleMembershipsStorageKey, next);
  return next;
}

export function touchCircleMembership(circleId: string) {
  const current = readCircleMemberships();
  const next = current.map((entry) =>
    entry.circleId === circleId
      ? { ...entry, lastOpenedAt: new Date().toISOString() }
      : entry,
  );
  writeJsonValue(circleMembershipsStorageKey, next);
  return next;
}

export function incrementCircleShareCount(circleId: string) {
  const current = readCircleMemberships();
  const next = current.map((entry) =>
    entry.circleId === circleId
      ? {
          ...entry,
          shareCount: entry.shareCount + 1,
          lastOpenedAt: new Date().toISOString(),
        }
      : entry,
  );
  writeJsonValue(circleMembershipsStorageKey, next);
  return next;
}

export function togglePromotedSocialMoment(moment: PromotedSocialMomentRecord) {
  const current = readPromotedSocialMoments();
  const existing = current.find((entry) => entry.id === moment.id);
  const next = existing
    ? current.filter((entry) => entry.id !== moment.id)
    : [moment, ...current];

  writeJsonValue(promotedMomentsStorageKey, next);
  return next;
}
