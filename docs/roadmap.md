# Roadmap

Explorer grew in layers: a colony of villagers you command, then a character you walk, interiors
with NPCs, a pack of items, and finally harbours and ships you sail yourself. Each layer works, but
they are not yet one game. This page says where the seams are and what to do about them.

## The three layers today

- **Settlement:** villagers pick their own jobs, build, and haul goods to one shared stockpile.
  Magic-house upgrades and the Great Work are the long goal.
- **Adventure:** one character per player (look creator, a 12-slot pack, loot on every island,
  interiors where NPCs do each building's business).
- **Sea:** a harbour with a growing pier, medieval ships you board and sail as captain or
  passenger, fog of war, sunken sites with divers, wrecks, pirates and storms.

All three run on one deterministic simulation (10 Hz) shared by the server and the offline mode.

## Where they do not fit yet

1. **Two control schemes.** Your character is driven with WASD, but villagers and ships are still
   ordered by selecting them and right-clicking from above.
2. **Two goals.** The Great Work (settlement) and loot and treasure (adventure) do not feed each
   other. Items in your pack are not used by anything yet.
3. **A fleet you command.** Scouts, cargo routes, diving and raids still assume ships obey orders;
   a ship with a crew is only another way of moving the same ship.
4. **Size.** A few files mix many concerns (`render/entities.ts`, `game/game.ts`, `ui/hud.ts`, the
   building sprites), which makes every new feature slower than it should be.

## Suggested order

1. **One main loop.** Make the crew adventure the centre, with the settlement as the home port that
   supports it. Loot and wreck finds become inputs to upgrades and the Great Work; your character,
   not a menu, builds and carries goods; villagers stay as background workers.
2. **One input model.** Move ship orders (cargo routes, scouting, diving) onto in-world actions:
   talk to the harbourmaster, board, dive from the deck. Keep right-click as a shortcut only.
3. **Crew roles.** Give passengers jobs: a lookout widens sight, a gunner fires the cannons at
   raiders, a diver works the sunken sites. Scale pirates and storms to the crew, not the fleet.
4. **Ports with people.** NPC shops, quests and bounties that give a reason to visit other islands,
   built on the interiors system.
5. **Equipment.** Hats, weapons and boots as the first real items in the pack (the hero sprite
   layers are ready for them).
6. **Teach and tune.** A first-minutes goal and hints for harbour, boarding and sailing, and raid
   and storm pacing for one to four players.
7. **Platform.** Accounts beyond name and token, deployment, reconnect handling and versioned saves.
