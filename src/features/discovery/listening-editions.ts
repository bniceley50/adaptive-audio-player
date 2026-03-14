export type FeaturedListeningEdition = {
  id: string;
  title: string;
  creator: string;
  narratorName: string;
  mode: "classic" | "ambient" | "immersive";
  bookTitle: string;
  genreLabel: string;
  bestFor: string;
  note: string;
};

export const featuredListeningEditions: FeaturedListeningEdition[] = [
  {
    id: "cinematic-harbor",
    title: "Cinematic Harbor Edition",
    creator: "Editorial Circle",
    narratorName: "Sloane",
    mode: "immersive",
    bookTitle: "Storm Harbor",
    genreLabel: "Maritime mystery",
    bestFor: "big reveals, weather-heavy scenes, and tense night listening",
    note:
      "Built for listeners who want a premium, screen-worthy atmosphere without losing spoken clarity.",
  },
  {
    id: "quiet-detective",
    title: "Quiet Detective Edition",
    creator: "Library Desk",
    narratorName: "Mara",
    mode: "classic",
    bookTitle: "Ashen Signals",
    genreLabel: "Literary suspense",
    bestFor: "focus sessions, commute listening, and dialogue-first chapters",
    note:
      "A clean narration profile with just enough edge to keep slower mysteries feeling intentional.",
  },
  {
    id: "night-window",
    title: "Night Window Edition",
    creator: "Late Shift Club",
    narratorName: "Noah",
    mode: "ambient",
    bookTitle: "The Last Observatory",
    genreLabel: "Speculative drama",
    bestFor: "late-night listening, wind-down sessions, and reflective chapters",
    note:
      "A calmer listening edition that makes long-form books feel softer and easier to stay with.",
  },
];
