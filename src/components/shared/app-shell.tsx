"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function AppShell({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const navItems = [
    { href: "/", label: "Home", description: "Library and account" },
    { href: "/import", label: "Import", description: "Bring in a new book" },
    { href: "/social", label: "Social", description: "Editions and circles" },
    { href: "/jobs", label: "Jobs", description: "Queue and backend activity" },
  ];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f4e8cf_0%,#fbf8f2_24%,#ffffff_62%)] px-6 py-8 text-stone-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#fffaf0_0%,#ffffff_52%,#eef4ff_100%)] shadow-[0_24px_70px_-46px_rgba(28,25,23,0.38)]">
          <div className="flex flex-col gap-6 px-6 py-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-stone-950 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white">
                  Adaptive Audio Player
                </span>
                {eyebrow ? (
                  <span className="rounded-full border border-stone-200 bg-white/80 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-600">
                    {eyebrow}
                  </span>
                ) : null}
              </div>
              <div className="space-y-2">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-stone-950 lg:text-5xl">
                  {title}
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-stone-600 lg:text-base">
                  Private AI audiobooks with customizable voices, adaptive listening
                  modes, and a backend workflow strong enough to feel like a real SaaS.
                </p>
              </div>
            </div>
            <div className="rounded-[1.6rem] border border-white/80 bg-white/80 p-3 shadow-sm backdrop-blur lg:min-w-[18rem]">
              <p className="px-2 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
                Navigate
              </p>
              <div className="mt-3 grid gap-2">
                {navItems.map((item) => {
                  const isActive =
                    item.href === "/"
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      key={item.href}
                      className={`rounded-[1.25rem] border px-4 py-3 transition ${
                        isActive
                          ? "border-stone-950 bg-stone-950 text-white shadow-[0_18px_36px_-28px_rgba(28,25,23,0.7)]"
                          : "border-stone-200 bg-stone-50/80 text-stone-900 hover:border-stone-300 hover:bg-white"
                      }`}
                      href={item.href}
                    >
                      <span className="block text-sm font-semibold">{item.label}</span>
                      <span
                        className={`mt-1 block text-xs leading-5 ${
                          isActive ? "text-stone-200" : "text-stone-600"
                        }`}
                      >
                        {item.description}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}
