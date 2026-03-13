import type { ListeningMode } from "@/lib/types/models";

export const tastePresets = [
  {
    id: "storytime",
    title: "Storytime",
    detail: "Warm and cinematic for fiction that should feel rich right away.",
    narratorId: "marlowe",
    mode: "immersive" as ListeningMode,
  },
  {
    id: "focus",
    title: "Focus",
    detail: "Clean and steady for long listening sessions with minimal distraction.",
    narratorId: "sloane",
    mode: "classic" as ListeningMode,
  },
  {
    id: "night",
    title: "Night",
    detail: "Soft pacing with atmosphere for winding down or late-night listening.",
    narratorId: "sloane",
    mode: "ambient" as ListeningMode,
  },
  {
    id: "bright",
    title: "Bright",
    detail: "Lighter energy for upbeat listening and fast-moving samples.",
    narratorId: "jules",
    mode: "ambient" as ListeningMode,
  },
] as const;

export function getBookCoverTheme(title: string) {
  const themes = [
    "from-amber-200 via-orange-100 to-stone-50",
    "from-sky-200 via-cyan-100 to-white",
    "from-rose-200 via-fuchsia-100 to-white",
    "from-emerald-200 via-teal-100 to-white",
    "from-violet-200 via-indigo-100 to-white",
  ];
  const index =
    title.split("").reduce((sum, character) => sum + character.charCodeAt(0), 0) %
    themes.length;
  return themes[index];
}

export function getBookInitials(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function getUpdatedAtWeight(updatedAt: string | null | undefined): number {
  if (!updatedAt) {
    return 0;
  }

  const timestamp = new Date(updatedAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
