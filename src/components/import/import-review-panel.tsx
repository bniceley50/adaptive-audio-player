export function ImportReviewPanel() {
  return (
    <section className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-stone-900">Import review</h2>
      <ul className="mt-4 space-y-2 text-sm text-stone-600">
        <li>Possible front matter</li>
        <li>Chapter break review</li>
        <li>Formatting cleanup</li>
      </ul>
    </section>
  );
}
