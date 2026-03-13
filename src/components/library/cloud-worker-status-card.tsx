"use client";

import type { WorkerHeartbeatSummary } from "@/lib/backend/types";

export function CloudWorkerStatusCard({
  workerHeartbeat,
  renderedAt,
}: {
  workerHeartbeat: WorkerHeartbeatSummary | null;
  renderedAt: string;
}) {
  const workerLagMs = workerHeartbeat
    ? new Date(renderedAt).getTime() -
      new Date(workerHeartbeat.lastHeartbeatAt).getTime()
    : null;
  const workerState = !workerHeartbeat
    ? {
        badge: "Worker unseen",
        detail: "No worker heartbeat has been recorded yet.",
        tone: "border-amber-200 bg-amber-50 text-amber-900",
      }
    : workerLagMs !== null && workerLagMs > 30_000
      ? {
          badge: "Worker offline",
          detail: "The background worker has not checked in recently.",
          tone: "border-rose-200 bg-rose-50 text-rose-900",
        }
      : workerHeartbeat.status === "processing"
        ? {
            badge: "Worker active",
            detail: "Background generation is running right now.",
            tone: "border-sky-200 bg-sky-50 text-sky-900",
          }
        : {
            badge: "Worker healthy",
            detail: "The background worker is online and ready.",
            tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
          };

  return (
    <div
      className={`mt-4 rounded-[1.4rem] border px-4 py-4 text-sm shadow-sm ${workerState.tone}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em]">
            Background worker
          </p>
          <p className="mt-2 text-base font-semibold">{workerState.badge}</p>
          <p className="mt-1 leading-6 opacity-90">{workerState.detail}</p>
        </div>
        {workerHeartbeat ? (
          <div className="rounded-full border border-current/15 bg-white/70 px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] shadow-sm">
            Last heartbeat {new Date(workerHeartbeat.lastHeartbeatAt).toLocaleTimeString()}
          </div>
        ) : null}
      </div>
    </div>
  );
}
