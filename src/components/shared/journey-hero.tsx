import type { ReactNode } from "react";

import { JourneyRail } from "@/components/shared/journey-rail";

interface JourneyStep {
  id: string;
  label: string;
  title: string;
  detail: string;
}

interface JourneyHeroProps {
  eyebrow: string;
  title: string;
  detail: string;
  currentIndex: number;
  currentTitle?: string;
  steps: readonly JourneyStep[];
  sectionClassName?: string;
  aside?: ReactNode;
}

export function JourneyHero({
  eyebrow,
  title,
  detail,
  currentIndex,
  currentTitle,
  steps,
  sectionClassName = "rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#fffdf8_0%,#ffffff_42%,#eef4ff_100%)] p-6 shadow-[0_22px_60px_-42px_rgba(28,25,23,0.38)]",
  aside,
}: JourneyHeroProps) {
  return (
    <section className={sectionClassName}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-stone-950">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">{detail}</p>
        </div>
        {aside ?? currentTitle ? (
          <div className="rounded-[1.4rem] border border-white/80 bg-white/85 px-4 py-3 shadow-sm backdrop-blur">
            {aside ?? (
              <>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
                  You are here
                </p>
                <p className="mt-2 text-lg font-semibold text-stone-950">
                  {currentTitle}
                </p>
              </>
            )}
          </div>
        ) : null}
      </div>
      <JourneyRail currentIndex={currentIndex} steps={steps} />
    </section>
  );
}
