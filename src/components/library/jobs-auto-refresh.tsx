"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function JobsAutoRefresh({ hasPendingJobs }: { hasPendingJobs: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!hasPendingJobs) {
      return;
    }

    const interval = window.setInterval(() => {
      router.refresh();
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [hasPendingJobs, router]);

  return null;
}
