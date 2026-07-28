import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";

import { AppShell } from "@/components/shared/app-shell";

export const metadata: Metadata = {
  title: "About | Adaptive Audio Player",
  description:
    "Application version, local narration model attribution, and third-party notices.",
};

export const dynamic = "force-static";

const applicationVersion = "0.1.0";
const kokoroRevision = "f3ff3571791e39611d31c381e3a41a3af07b4987";

type ReadTextFile = (
  filePath: string,
  encoding: BufferEncoding,
) => Promise<string>;

export function noticePathCandidates(cwd: string) {
  const normalizedCwd = path.resolve(cwd);
  return [
    path.join(normalizedCwd, "THIRD_PARTY_NOTICES.md"),
    path.resolve(normalizedCwd, "..", "..", "THIRD_PARTY_NOTICES.md"),
  ];
}

export async function readThirdPartyNotices({
  cwd = process.cwd(),
  readTextFile = readFile as ReadTextFile,
}: {
  cwd?: string;
  readTextFile?: ReadTextFile;
} = {}) {
  const candidates = noticePathCandidates(cwd);
  for (const candidate of candidates) {
    try {
      const notices = await readTextFile(candidate, "utf8");
      if (!notices.startsWith("# Third-Party Notices\n")) {
        throw new Error(
          `The reviewed third-party notice has an invalid heading: ${candidate}`,
        );
      }
      return notices;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
  throw new Error(
    `The reviewed third-party notice is missing from: ${candidates.join(", ")}`,
  );
}

export default async function AboutPage() {
  const notices = await readThirdPartyNotices();

  return (
    <AppShell eyebrow="Release information" title="About Adaptive Audio Player">
      <section
        aria-labelledby="about-version-heading"
        className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
          Windows application
        </p>
        <h2
          className="mt-2 text-2xl font-semibold text-stone-950"
          id="about-version-heading"
        >
          Version {applicationVersion}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
          Adaptive Audio Player runs narration locally. Imported text, model
          inference, and generated audio remain on this computer.
        </p>
      </section>

      <section
        aria-labelledby="about-model-heading"
        className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
          Narration model
        </p>
        <h2
          className="mt-2 text-2xl font-semibold text-stone-950"
          id="about-model-heading"
        >
          Kokoro-82M
        </h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-stone-900">Source</dt>
            <dd className="mt-1 text-stone-600">hexgrad/Kokoro-82M</dd>
          </div>
          <div>
            <dt className="font-semibold text-stone-900">License</dt>
            <dd className="mt-1 text-stone-600">Apache-2.0</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-semibold text-stone-900">
              Immutable source revision
            </dt>
            <dd className="mt-1 break-all font-mono text-xs text-stone-600">
              {kokoroRevision}
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="about-notices-heading"
        className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm"
      >
        <h2
          className="text-2xl font-semibold text-stone-950"
          id="about-notices-heading"
        >
          Third-party notices
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
          This application includes open-source runtimes, libraries, and model
          resources. Expand the complete reviewed notice for component versions,
          licenses, and source obligations.
        </p>
        <details className="mt-5 rounded-2xl border border-stone-200 bg-stone-50">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#274c5b]">
            Complete third-party notices
          </summary>
          <pre
            aria-label="Complete third-party notices"
            className="max-h-[36rem] overflow-auto border-t border-stone-200 p-4 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-stone-700"
            tabIndex={0}
          >
            {notices}
          </pre>
        </details>
      </section>
    </AppShell>
  );
}
