"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CancelJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [isCancelling, setIsCancelling] = useState(false);

  async function handleCancel() {
    setIsCancelling(true);
    await fetch("/api/jobs/cancel", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ jobId }),
    }).catch(() => null);
    setIsCancelling(false);
    router.refresh();
  }

  return (
    <button
      className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 disabled:border-stone-200 disabled:text-stone-400"
      type="button"
      disabled={isCancelling}
      onClick={() => {
        void handleCancel();
      }}
    >
      {isCancelling ? "Cancelling…" : "Cancel job"}
    </button>
  );
}
