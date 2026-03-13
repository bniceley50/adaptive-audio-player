interface JourneyStep {
  id: string;
  label: string;
  title: string;
  detail: string;
}

interface JourneyRailProps {
  steps: readonly JourneyStep[];
  currentIndex: number;
}

export function JourneyRail({ steps, currentIndex }: JourneyRailProps) {
  return (
    <div className="mt-5 grid gap-3 md:grid-cols-4">
      {steps.map((step, index) => {
        const state =
          index < currentIndex
            ? "complete"
            : index === currentIndex
              ? "active"
              : "upcoming";

        return (
          <article
            key={step.id}
            className={`rounded-[1.4rem] border px-4 py-4 shadow-sm transition ${
              state === "active"
                ? "border-stone-900 bg-stone-950 text-white"
                : state === "complete"
                  ? "border-emerald-200 bg-emerald-50/80"
                  : "border-stone-200/80 bg-white/80"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] ${
                  state === "active"
                    ? "bg-white/15 text-white"
                    : state === "complete"
                      ? "bg-emerald-600 text-white"
                      : "bg-stone-200 text-stone-700"
                }`}
              >
                {step.label}
              </span>
              <span
                className={`text-[0.65rem] font-semibold uppercase tracking-[0.18em] ${
                  state === "active"
                    ? "text-white/70"
                    : state === "complete"
                      ? "text-emerald-700"
                      : "text-stone-500"
                }`}
              >
                {state === "active"
                  ? "Current"
                  : state === "complete"
                    ? "Done"
                    : "Next"}
              </span>
            </div>
            <p
              className={`mt-4 text-base font-semibold ${
                state === "active" ? "text-white" : "text-stone-950"
              }`}
            >
              {step.title}
            </p>
            <p
              className={`mt-1 text-sm leading-6 ${
                state === "active" ? "text-white/75" : "text-stone-600"
              }`}
            >
              {step.detail}
            </p>
          </article>
        );
      })}
    </div>
  );
}
