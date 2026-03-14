type ExperienceMode = "everyday" | "studio";

interface ExperienceModeToggleProps {
  mode: ExperienceMode;
  onModeChange: (mode: ExperienceMode) => void;
  title?: string;
  detail?: string;
}

export function ExperienceModeToggle({
  mode,
  onModeChange,
  title = "Choose your view",
  detail = "Everyday keeps the screen focused on the next best action. Studio reveals deeper render history, compare tools, and technical listening context when you want more control.",
}: ExperienceModeToggleProps) {
  return (
    <section className="rounded-[1.75rem] border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            View mode
          </p>
          <h2 className="mt-2 text-xl font-semibold text-stone-950">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">{detail}</p>
        </div>
        <div className="inline-flex rounded-full border border-stone-200 bg-stone-100 p-1 shadow-sm">
          <button
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              mode === "everyday"
                ? "bg-white text-stone-950 shadow-sm"
                : "text-stone-600 hover:text-stone-950"
            }`}
            type="button"
            onClick={() => onModeChange("everyday")}
          >
            Everyday
          </button>
          <button
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              mode === "studio"
                ? "bg-stone-950 text-white shadow-sm"
                : "text-stone-600 hover:text-stone-950"
            }`}
            type="button"
            onClick={() => onModeChange("studio")}
          >
            Studio
          </button>
        </div>
      </div>
    </section>
  );
}
