// What the people inside the buildings say. The buildings' business itself (training villagers,
// trading, upgrades, the Great Work, ships, demolishing) is shown by the HUD under this greeting.
import {
  population,
  populationCap,
  ROOMS,
  npcName,
  type BuildingEntity,
  type GameState,
  type NpcRole,
} from "@explorer/shared";

export interface Talk {
  name: string;
  title: string;
  line: string;
}

const LINES: Record<NpcRole, (state: GameState) => string> = {
  steward: (s) =>
    `Welcome to the town hall. We are ${population(s)} of ${populationCap(s)} the houses can hold. Shall I send for another pair of hands?`,
  resident: (s) =>
    s.time % 480 > 360
      ? "It's getting dark. Sit by the fire a while; the raiders come at dusk."
      : "Make yourself at home. The villagers are out working; there is always more to build.",
  merchant: () => "Everything has a price, traveller. Sell what you have, buy what you need.",
  smith: (s) =>
    s.stock.ore >= 2
      ? "The forge is hot and the ore is waiting. Tools will not make themselves."
      : "No ore, no tools. Send someone to the mine, and I will do the rest.",
  priest: (s) =>
    `The faith of the settlement stands at ${s.stock.faith}. Light a candle; it costs nothing and helps more than you'd think.`,
  sage: () => "The old knowledge still hums in the stones. Learn what you can afford.",
  architect: () =>
    "The Great Work will outlast all of us. Show me the goods and the next stage will rise.",
  harbourmaster: () =>
    "Ships in and ships out. Give me timber and I'll give you a hull; give me a hull and the sea is yours.",
};

/** The NPC of a building and what they have to say right now. */
export function talkFor(state: GameState, b: BuildingEntity): Talk | null {
  const def = ROOMS[b.kind];
  if (!def) return null;
  return { name: npcName(state, b), title: def.npc.title, line: LINES[def.npc.role](state) };
}
