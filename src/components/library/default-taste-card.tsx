"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LocalListeningProfile } from "@/lib/library/local-library";
import {
  clearDefaultListeningProfile,
  describeListeningTasteSource,
  defaultTasteChangedEvent,
  readDefaultListeningProfile,
} from "@/lib/library/local-library";

interface DefaultTasteCardProps {
  initialProfile?: LocalListeningProfile | null;
}

export function DefaultTasteCard({ initialProfile = null }: DefaultTasteCardProps) {
  const [defaultProfile, setDefaultProfile] = useState(() =>
    initialProfile ?? readDefaultListeningProfile(),
  );

  useEffect(() => {
    function handleDefaultTasteChanged() {
      setDefaultProfile(readDefaultListeningProfile());
    }

    window.addEventListener(defaultTasteChangedEvent, handleDefaultTasteChanged);
    return () => {
      window.removeEventListener(
        defaultTasteChangedEvent,
        handleDefaultTasteChanged,
      );
    };
  }, []);

  function clearDefaultTaste() {
    clearDefaultListeningProfile();
  }

  const sourceMeta = defaultProfile
    ? describeListeningTasteSource({
        profile: defaultProfile,
        source: "default",
      })
    : null;

  return (
    <section className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-stone-900">Default taste</h2>
      {defaultProfile ? (
        <>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            New imports will start from {defaultProfile.narratorName} in{" "}
            <span className="capitalize">{defaultProfile.mode}</span>.
          </p>
          <div className="mt-4 rounded-2xl border border-dashed border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
            <p className="font-medium">{sourceMeta?.badge}: {sourceMeta?.summary}</p>
            <p className="mt-1">{sourceMeta?.detail}</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
            <span className="rounded-full bg-stone-100 px-3 py-2">
              Narrator: {defaultProfile.narratorName}
            </span>
            <span className="rounded-full bg-stone-100 px-3 py-2 capitalize">
              Mode: {defaultProfile.mode}
            </span>
          </div>
          <button
            className="mt-5 rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700"
            type="button"
            onClick={clearDefaultTaste}
          >
            Clear default taste
          </button>
          <Link
            className="ml-3 inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white"
            href="/import"
          >
            Import with this taste
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            No default taste saved yet.
          </p>
          <p className="mt-3 text-sm leading-6 text-stone-500">
            New imports will borrow your latest listening profile until you save a
            default.
          </p>
        </>
      )}
    </section>
  );
}
