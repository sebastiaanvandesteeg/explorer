// How a world is played, chosen when it is created and shared by everyone in it.

export const GAME_MODES = ["colony", "adventure"] as const;
export type GameMode = (typeof GAME_MODES)[number];

export interface GameModeDef {
  id: GameMode;
  name: string;
  description: string;
}

export const MODE_DEFS: Record<GameMode, GameModeDef> = {
  colony: {
    id: "colony",
    name: "Colony",
    description: "Command the villagers from above: mark resources, raise buildings, send ships.",
  },
  adventure: {
    id: "adventure",
    name: "Adventure",
    description:
      "Early preview: every player controls their own character. Right-click to walk, and the camera follows you. Villagers keep the settlement running.",
  },
};

export function isGameMode(v: unknown): v is GameMode {
  return typeof v === "string" && (GAME_MODES as readonly string[]).includes(v);
}
