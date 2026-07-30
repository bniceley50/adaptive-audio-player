"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function AppShell({
  eyebrow,
  title,
  children,
  variant = "default",
}: {
  eyebrow?: string;
  title: string;
  children: ReactNode;
  variant?: "default" | "player";
}) {
  const pathname = usePathname();
  const navItems = [
    { href: "/", label: "Library", description: "Your books and listening progress" },
    { href: "/import", label: "Add book", description: "Import a book to narrate" },
  ];

  const playerNavItems = [
    { href: "/", label: "Library" },
    { href: "/import", label: "Add book" },
  ];

  if (variant === "player") {
    return (
      <main className="min-h-screen bg-[var(--player-bg-1)] text-[var(--player-text)]">
        <div className="mx-auto w-full max-w-7xl px-4 py-3 lg:px-6">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--player-border)] bg-[var(--player-panel)] px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <Link
                className="shrink-0 text-sm text-[var(--player-text-soft)] transition hover:text-[var(--player-text)]"
                href="/"
              >
                ← Library
              </Link>
              <h1 className="truncate text-lg font-semibold text-white">
                {title}
              </h1>
            </div>
            <nav className="flex flex-wrap gap-2">
              {playerNavItems.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      isActive
                        ? "bg-white/12 text-white"
                        : "text-[var(--player-text-soft)] hover:bg-white/6 hover:text-[var(--player-text)]"
                    }`}
                    href={item.href}
                    {...(isActive ? { "aria-current": "page" as const } : {})}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </header>
          <div className="flex flex-col gap-6">
            {children}
          </div>
          <footer className="mt-6 flex justify-end border-t border-[var(--player-border)] pt-4">
            <Link
              className="text-xs text-[var(--player-text-soft)] transition hover:text-[var(--player-text)]"
              href="/about"
            >
              About &amp; third-party notices
            </Link>
          </footer>
        </div>
      </main>
    );
  }

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
                  Import a book, choose a voice, and listen.
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
                          ? "border-[#274c5b] bg-[#274c5b] text-stone-50 shadow-[0_18px_36px_-28px_rgba(39,76,91,0.7)]"
                          : "border-stone-200 bg-stone-50/80 text-stone-900 hover:border-stone-300 hover:bg-white"
                      }`}
                      href={item.href}
                    >
                      <span
                        className={`block text-sm font-semibold ${
                          isActive ? "text-stone-50" : "text-stone-900"
                        }`}
                      >
                        {item.label}
                      </span>
                      <span
                        className={`mt-1 block text-xs leading-5 ${
                          isActive ? "text-stone-100/90" : "text-stone-600"
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
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 px-1 pt-2 text-xs text-stone-500">
          <span>Adaptive Audio Player 0.1.0</span>
          <Link
            className="font-medium text-stone-600 underline-offset-4 transition hover:text-stone-950 hover:underline"
            href="/about"
          >
            About &amp; third-party notices
          </Link>
        </footer>
      </div>
    </main>
  );
}
