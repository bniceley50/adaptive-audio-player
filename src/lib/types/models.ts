export type ListeningMode = "classic" | "ambient" | "immersive";

export interface Book {
  id: string;
  title: string;
  author?: string;
}

export interface Chapter {
  id: string;
  title: string;
  text: string;
  order: number;
}

export interface NarrationProfile {
  narratorId: string;
  mode: ListeningMode;
  speed: number;
  tone: string;
  warmth: number;
  energy: number;
}
