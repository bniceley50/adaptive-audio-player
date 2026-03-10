export function SamplePlayer() {
  return (
    <section className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-stone-900">Sample player</h2>
      <div className="mt-4 rounded-2xl bg-stone-950 px-5 py-6 text-white">
        <p className="text-sm uppercase tracking-[0.22em] text-stone-300">
          First play
        </p>
        <p className="mt-3 text-2xl font-semibold">Chapter 1 sample</p>
        <div className="mt-6 h-2 rounded-full bg-white/15">
          <div className="h-2 w-1/3 rounded-full bg-amber-300" />
        </div>
      </div>
    </section>
  );
}
