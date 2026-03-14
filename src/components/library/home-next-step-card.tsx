import Link from "next/link";

interface HomeNextStepCardProps {
  hasSyncedBook: boolean;
  latestBookTitle: string | null;
  latestBookHref: string | null;
  isSignedIn: boolean;
  listeningStreakDays: number;
  recommendedEdition: string | null;
}

export function HomeNextStepCard({
  hasSyncedBook,
  latestBookTitle,
  latestBookHref,
  isSignedIn,
  listeningStreakDays,
  recommendedEdition,
}: HomeNextStepCardProps) {
  const primaryAction = hasSyncedBook && latestBookHref
    ? {
        title: "Resume your best current title",
        body: latestBookTitle
          ? `Jump back into ${latestBookTitle} and keep the listening loop moving.`
          : "Jump back into your latest synced title and keep the listening loop moving.",
        href: latestBookHref,
        label: "Resume listening",
      }
    : {
        title: "Import your first book",
        body: "Paste text or upload a file, preview the chapters, and move straight into setup.",
        href: "/import?source=paste",
        label: "Start importing",
      };

  const secondaryActions = [
    {
      title: "Start from discovery",
      body: recommendedEdition
        ? `Use ${recommendedEdition} if you want the app to make the first sound decision for you.`
        : "Use a featured listening edition if you want the app to make the first sound decision for you.",
      href: "/import?edition=cinematic-harbor",
      label: "Try a featured edition",
    },
    {
      title: "See the private audio path",
      body:
        "If your personal library already has DRM-free or converted audiobook files, the app now shows where that future import path will live.",
      href: "/import?source=audio",
      label: "View audio import plans",
    },
    {
      title: isSignedIn ? "Keep your progress portable" : "Create an account when you are ready",
      body: isSignedIn
        ? "Your current library can follow you across workspaces and browsers."
        : "Sign in later if you want your library, progress, and circles to travel with you.",
      href: "#account-context",
      label: isSignedIn ? "Open account" : "See account options",
    },
  ];

  return (
    <section className="rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#fffefb_0%,#ffffff_45%,#eef4ff_100%)] p-6 shadow-[0_24px_70px_-46px_rgba(28,25,23,0.42)]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
            Your next move
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-stone-950">
            Start with one clear action
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
            The product is easiest when you follow one immediate step, then decide whether you want discovery, account sync, or deeper tools after that.
          </p>
        </div>
        <div className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm text-stone-600 shadow-sm backdrop-blur">
          {listeningStreakDays > 0
            ? `${listeningStreakDays}-day listening streak`
            : "Library first. Everything else later."}
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-[1.6rem] border border-stone-200/80 bg-white/90 p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Best next action
          </p>
          <h3 className="mt-3 text-xl font-semibold text-stone-950">
            {primaryAction.title}
          </h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
            {primaryAction.body}
          </p>
          <Link
            className="mt-5 inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
            href={primaryAction.href}
          >
            {primaryAction.label}
          </Link>
        </article>

        <div className="grid gap-4">
          {secondaryActions.map((action) => (
            <article
              key={action.title}
              className="rounded-[1.5rem] border border-stone-200/80 bg-white/85 p-5 shadow-sm"
            >
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
                Then
              </p>
              <h3 className="mt-2 text-lg font-semibold text-stone-950">{action.title}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">{action.body}</p>
              <Link
                className="mt-4 inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                href={action.href}
              >
                {action.label}
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
