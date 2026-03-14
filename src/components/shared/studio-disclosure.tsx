import type { ReactNode } from "react";

interface StudioDisclosureProps {
  title: string;
  detail: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function StudioDisclosure({
  title,
  detail,
  children,
  defaultOpen = false,
}: StudioDisclosureProps) {
  return (
    <details
      className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(180deg,#fffefb_0%,#ffffff_100%)] shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]"
      open={defaultOpen}
    >
      <summary className="cursor-pointer list-none px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              Studio
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-950">{title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">{detail}</p>
          </div>
          <div className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-600 shadow-sm">
            Open advanced controls and system context
          </div>
        </div>
      </summary>
      <div className="border-t border-stone-200/80 px-6 pb-6 pt-4">{children}</div>
    </details>
  );
}
