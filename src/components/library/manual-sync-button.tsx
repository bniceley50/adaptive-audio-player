"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { pushClientLibrarySyncSnapshot } from "@/lib/backend/client-sync";

export function ManualSyncButton() {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);

  async function handleSync() {
    setIsSyncing(true);
    await pushClientLibrarySyncSnapshot().catch(() => null);
    setIsSyncing(false);
    router.refresh();
  }

  return (
    <button
      className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 disabled:border-stone-200 disabled:text-stone-400"
      type="button"
      disabled={isSyncing}
      onClick={() => {
        void handleSync();
      }}
    >
      {isSyncing ? "Syncing…" : "Sync now"}
    </button>
  );
}
