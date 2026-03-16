import Link from "next/link";

interface HomeStartHereCardProps {
  latestBookTitle: string | null;
  latestBookHref: string | null;
}

export function HomeStartHereCard({
  latestBookTitle,
  latestBookHref,
}: HomeStartHereCardProps) {
  const hasResumePath = Boolean(latestBookHref);

  const primaryCard = hasResumePath
    ? {
        eyebrow: "Resume",
        title: latestBookTitle ? `Keep listening to ${latestBookTitle}` : "Resume your last book",
        detail:
          "Jump back into the last title you touched. This is the fastest way to get audio playing again.",
        href: latestBookHref as string,
        label: "Resume listening",
      }
    : {
        eyebrow: "Start here",
        title: "Start with a sample book",
        detail:
          "Load the guided demo and hear the app working immediately. This is the easiest way to understand the product.",
        href: "/?demo=1",
        label: "Open the sample book",
      };

  const secondaryCards = hasResumePath
    ? [
        {
          eyebrow: "Bring your own",
          title: "Import text or audio",
          detail:
            "Paste text, upload a text file, or bring a personal audiobook file and move straight into listening.",
          href: "/import",
          label: "Import a book",
        },
        {
          eyebrow: "Optional",
          title: "Explore community picks",
          detail:
            "Browse listening versions, book clubs, and highlights after you know what you want to hear next.",
          href: "/social",
          label: "Explore community",
        },
      ]
    : [
        {
          eyebrow: "Bring your own",
          title: "Import your own book",
          detail:
            "Paste text or upload a file if you already know what you want to listen to.",
          href: "/import",
          label: "Import a book",
        },
        {
          eyebrow: "Optional",
          title: "Explore community picks",
          detail:
            "Browse community listening versions, book clubs, and highlights. You do not need this to use the app.",
          href: "/social",
          label: "Explore community",
        },
      ];

  return (
    <section className="rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#fffef9_0%,#ffffff_52%,#eef4ff_100%)] p-6 shadow-[0_24px_70px_-46px_rgba(28,25,23,0.42)]">
      <div className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
          Start listening
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">
          Bring in a book and press play
        </h2>
        <p className="mt-3 text-base leading-7 text-stone-600">
          This app is for turning a book into something you can listen to. Start with
          one clear path. You can ignore community, account, and advanced controls until
          after audio is playing.
        </p>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr_0.85fr]">
        <article className="rounded-[1.6rem] border border-emerald-200 bg-emerald-50/80 p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-emerald-700">
            {primaryCard.eyebrow}
          </p>
          <h3 className="mt-3 text-2xl font-semibold text-stone-950">
            {primaryCard.title}
          </h3>
          <p className="mt-3 text-sm leading-6 text-stone-700">{primaryCard.detail}</p>
          <Link
            className="mt-5 inline-flex items-center justify-center rounded-full bg-[#274c5b] px-5 py-3 text-sm font-semibold text-stone-50 shadow-[0_14px_32px_-24px_rgba(39,76,91,0.8)] transition hover:bg-[#1f3d49]"
            href={primaryCard.href}
          >
            {primaryCard.label}
          </Link>
        </article>

        {secondaryCards.map((card) => (
          <article
            key={card.title}
            className="rounded-[1.6rem] border border-stone-200 bg-white/90 p-5 shadow-sm"
          >
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
              {card.eyebrow}
            </p>
            <h3 className="mt-3 text-xl font-semibold text-stone-950">{card.title}</h3>
            <p className="mt-3 text-sm leading-6 text-stone-600">{card.detail}</p>
            <Link
              className="mt-5 inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-900 transition hover:border-stone-400 hover:bg-stone-50"
              href={card.href}
            >
              {card.label}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
