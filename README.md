# Explorer

A co-op, browser-based isometric pixel-art game about exploring a randomly generated archipelago and building a settlement together. Up to 8 players share one island, one stockpile and one map.

![Gameplay](docs/screenshot.png)

The art style follows the concept art below. Every sprite is **generated in code** using a palette sampled from it.

<details>
<summary>Concept art</summary>

![Concept art](docs/concept-art.webp)

</details>

## Play

Requirements: Node 24+ and pnpm 11 (`corepack enable` gives you the pinned version).

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts both parts:

- the game server on http://localhost:8787
- the Vite client on **http://localhost:5190**, which is the one to open

Start an expedition, then use **Copy invite link** to bring up to 7 friends.

- **Offline:** "Play offline" in the lobby (or `/?offline&seed=anything`) runs the whole simulation in your browser. Nothing is saved.
- **Production:** `pnpm build && pnpm start` builds the client, and the Node server then serves game and API from one port (8787).

### Controls

| Action | How                                                                                                                              |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Pan    | Drag the ground, right/middle-drag, or WASD / arrow keys                                                                         |
| Zoom   | Mouse wheel, `+` / `-`                                                                                                           |
| Gather | `H`, then click or drag a box across trees, rocks and bushes (Shift to unmark)                                                   |
| Build  | `1`–`6` or the build menu, then click. Shift-click keeps placing. Paths can be dragged                                           |
| Select | Click a villager, ship, building or resource                                                                                     |
| Order  | With a villager selected, right-click a resource, building or the ground. With a ship selected, right-click the sea or an island |
| Cancel | `Esc` or right-click                                                                                                             |
| Chat   | `Enter`                                                                                                                          |
| Home   | `C` centres on the town hall                                                                                                     |

### How a settlement grows

- **Villagers pick up work by themselves:** building sites first, then staffing camps and farms, then marked resources. They carry up to 5 goods to the nearest town hall or storehouse (or camp). Trees regrow from their stumps.
- **Houses** add room for 4 villagers. You train new villagers at the town hall for 20 food.
- **Lumber camps and quarries** each take one worker, who harvests within 8 tiles automatically. **Farms** turn a worker's time into food.
- **Exploring:** the dock builds scout ships. Sailing clears the fog for everyone, and each newly found island (forest, farmland, rocky or islet) is announced.

## Architecture

```
packages/shared   @explorer/shared: deterministic core used by client and server
  iso.ts            2:1 isometric projection and elevation-aware picking
  world/            seeded archipelago generation, A* pathfinding
  sim/              catalogue, state, commands, 10 Hz tick, snapshots and patches
  protocol.ts       WebSocket message types
packages/server   @explorer/server: node:http + ws, world rooms, JSON persistence
packages/client   @explorer/client: PixiJS v8 renderer, input, DOM HUD, sessions
tools/sprites     palette extraction and the sprite generator → client/public/assets
```

- **Server-authoritative co-op.** Each world is a room that runs `tick()` 10 times a second. It validates every command with `applyCommand()` and broadcasts a patch with only what changed.
  - Clients receive the world _seed_ plus a snapshot of the parts that change. They regenerate the terrain themselves.
  - Clients mirror state with `applyPatch()` and smooth movement between ticks.
- **Offline mode** uses the same `tick()` and `applyCommand()` in the browser (`LocalSession`), so single-player and co-op behave identically.
- **Persistence:** each world is saved to `data/worlds/<id>.json` every 30 s, when the last player leaves and on shutdown. Saves are atomic.
  - Players are identified by name plus a random token kept in `localStorage`. Only a hash of the token is stored on the server.
- **Rendering:**
  - Terrain is baked into 16×16-tile render-texture chunks on demand.
  - Buildings, trees, villagers and ships are depth-sorted by `x + y`.
  - Fog of war and the shallow-water glow are smooth masks projected onto the isometric grid.
  - Zoom uses integer steps so pixels stay crisp.

## Pixel art pipeline

`pnpm sprites` regenerates `packages/client/public/assets/atlas.{png,json}` and the ocean textures, in about a second:

1. **`extract-palette.ts`** samples `docs/concept-art.webp` into `palette.extracted.json`. The curated ramps in `palette.ts` are hand-picked from those samples.
2. **Terrain tiles** (`sprites/terrain.ts`) are drawn directly on exact 32×16 diamonds. They use tile-periodic noise so neighbouring tiles join seamlessly.
3. **Objects** (`sprites/buildings.ts`, `nature.ts`, `units.ts`) are modelled with a tiny isometric ray-caster (`raytrace.ts`) from boxes, gable and hip roofs, prisms, cones and blobs.
   - Shading snaps to the palette ramps with restrained ordered dithering.
   - Cast shadows and dark outlines make it read as pixel art.
   - Villagers are drawn pixel by pixel.
4. **Packing:** everything goes into one atlas. Each frame keeps its anchor (a tile's top vertex, or a villager's feet) plus metadata such as chimney smoke emitters.

To **replace or add art**, add or modify a function in `tools/sprites/src/sprites/*` and run `pnpm sprites`. To swap in a hand-painted sprite, draw it into a `Canvas` with the same name and anchor. Browse every frame at **http://localhost:5190/sprites.html**, shown next to the concept art.

`pnpm sprites:check` (part of `pnpm test`) fails when the committed atlas is out of date.

## Scripts

| Script                      | What it does                                                                    |
| --------------------------- | ------------------------------------------------------------------------------- |
| `pnpm dev`                  | Server (watch) and Vite client                                                  |
| `pnpm build` / `pnpm start` | Build the client / run the server, which serves the built client                |
| `pnpm test`                 | Sprite freshness check plus shared, server and client tests                     |
| `pnpm test:e2e`             | Playwright smoke test: create a world, build, second player joins, offline mode |
| `pnpm check`                | Prettier, typecheck and tests (what CI runs, plus e2e)                          |
| `pnpm sprites`              | Regenerate the sprite atlas                                                     |

Server environment variables: `PORT` (8787), `HOST`, `DATA_DIR` (`data/worlds`), `CLIENT_DIR` (`packages/client/dist`).

## Not built yet

- Ferrying villagers by ship to settle other islands, including a second dock
- Trade and cargo ships
- Tools, the forge and ore processing
- Day/night cycle and sound
- Accounts beyond name + token
- Deployment
