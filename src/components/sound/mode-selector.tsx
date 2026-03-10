const modes = [
  {
    name: "Classic",
    description: "Clean narration only.",
  },
  {
    name: "Ambient",
    description: "Subtle scene-aware atmosphere.",
  },
  {
    name: "Immersive",
    description: "Richer mood and sound layering.",
  },
];

export function ModeSelector() {
  return (
    <section className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-stone-900">Listening mode</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {modes.map((mode) => (
          <article
            key={mode.name}
            className="rounded-2xl border border-stone-200 bg-stone-50 p-4"
          >
            <h3 className="font-medium text-stone-900">{mode.name}</h3>
            <p className="mt-2 text-sm text-stone-600">{mode.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
