"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RetryJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [isRetrying, setIsRetrying] = useState(false);

  async function handleRetry() {
    setIsRetrying(true);
    await fetch("/api/jobs/retry", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ jobId }),
    }).catch(() => null);
    setIsRetrying(false);
    router.refresh();
  }

  return (
    <button
      className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 disabled:border-stone-200 disabled:text-stone-400"
      type="button"
      disabled={isRetrying}
      onClick={() => {
        void handleRetry();
      }}
    >
      {isRetrying ? "Retrying…" : "Retry job"}
    </button>
  );
}
