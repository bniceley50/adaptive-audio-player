export interface AuthorSpotlight {
  name: string;
  shortBio: string;
  whyListenersStay: string;
  bestFor: string;
  signatureThemes: string[];
  recommendedEdition: string;
  recommendedEditionId: string;
}

interface AuthorSpotlightInput {
  bookId?: string | null;
  title?: string | null;
  genreLabel?: string | null;
}

const byBookId: Record<string, AuthorSpotlight> = {
  "demo-book-1": {
    name: "Elena Vale",
    shortBio:
      "Elena Vale writes coastal mysteries that stay elegant, patient, and character-first instead of turning into noise.",
    whyListenersStay:
      "Her books reward close listening because the tension builds through mood, observation, and the slow reveal of motive.",
    bestFor: "Readers who want a noir mystery that feels calm, sharp, and premium.",
    signatureThemes: ["Coastal noir", "Quiet suspense", "Moral ambiguity"],
    recommendedEdition: "Sloane in immersive mode",
    recommendedEditionId: "cinematic-harbor",
  },
  "demo-book-2": {
    name: "Jonah Mercer",
    shortBio:
      "Jonah Mercer writes night-train thrillers built on momentum, withheld information, and precise scene-setting.",
    whyListenersStay:
      "The chapters move quickly, so even a short sample gives you a strong feel for the pacing and tension curve.",
    bestFor: "Listeners who want a smart thriller with constant forward motion.",
    signatureThemes: ["Urban tension", "Late-night transit", "Fast reveals"],
    recommendedEdition: "Mara in classic mode",
    recommendedEditionId: "quiet-detective",
  },
  "demo-book-3": {
    name: "Ari Kessler",
    shortBio:
      "Ari Kessler writes reflective science fiction that feels intimate, spacious, and emotionally observant.",
    whyListenersStay:
      "The language has room to breathe, which makes voice choice and atmosphere especially noticeable in the setup flow.",
    bestFor: "Listeners who want thoughtful sci-fi with a calm, immersive tone.",
    signatureThemes: ["Orbital solitude", "Human-scale sci-fi", "Interior reflection"],
    recommendedEdition: "Noah in ambient mode",
    recommendedEditionId: "night-window",
  },
};

const byGenre: Record<string, AuthorSpotlight> = {
  mystery: {
    name: "Featured mystery author",
    shortBio:
      "This title leans into layered tension, sharp observation, and scenes that reward a more atmospheric performance.",
    whyListenersStay:
      "Mystery listeners tend to stay when the narration preserves restraint and makes the clues feel deliberate.",
    bestFor: "People who want suspense without losing clarity.",
    signatureThemes: ["Clues", "Atmosphere", "Slow reveals"],
    recommendedEdition: "A calm or immersive edition",
    recommendedEditionId: "cinematic-harbor",
  },
  thriller: {
    name: "Featured thriller author",
    shortBio:
      "This kind of book works best when the pacing stays crisp and the voice never feels sleepy.",
    whyListenersStay:
      "Thriller listeners respond to momentum, so the strongest editions usually keep chapters tight and urgent.",
    bestFor: "People who want a book that moves immediately.",
    signatureThemes: ["Pacing", "Escalation", "Forward motion"],
    recommendedEdition: "A clean, high-clarity edition",
    recommendedEditionId: "quiet-detective",
  },
  "sci-fi": {
    name: "Featured sci-fi author",
    shortBio:
      "This title benefits from narration that can hold scale, silence, and reflection at the same time.",
    whyListenersStay:
      "Science fiction often earns loyalty when the edition lets the world feel large without drowning the voice.",
    bestFor: "People who want atmosphere and ideas together.",
    signatureThemes: ["Scale", "Wonder", "Interiority"],
    recommendedEdition: "A spacious ambient edition",
    recommendedEditionId: "night-window",
  },
};

function normalizeTitle(title: string | null | undefined): string | null {
  if (!title) {
    return null;
  }

  return title.trim().toLowerCase();
}

const byTitle: Record<string, AuthorSpotlight> = {
  "harbor lights": byBookId["demo-book-1"],
  "midnight platform": byBookId["demo-book-2"],
  "quiet orbit": byBookId["demo-book-3"],
};

export function getAuthorSpotlight({
  bookId,
  title,
  genreLabel,
}: AuthorSpotlightInput): AuthorSpotlight | null {
  if (bookId && byBookId[bookId]) {
    return byBookId[bookId];
  }

  const normalizedTitle = normalizeTitle(title);
  if (normalizedTitle && byTitle[normalizedTitle]) {
    return byTitle[normalizedTitle];
  }

  const normalizedGenre = genreLabel?.trim().toLowerCase();
  if (normalizedGenre && byGenre[normalizedGenre]) {
    return byGenre[normalizedGenre];
  }

  return null;
}
