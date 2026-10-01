# Architecture

### The website

The landing site lives in `packages/client` next to the game: `/home` (or `/`), `/news`, `/the-lore` and `/about`. All of them share `src/site/shell.ts` (animated sea, weather, top bar) and a theme engine (`src/site/theme.ts`) that turns a biome into colours, weather and a skyline of that biome's plants and rocks.

- **Release notes** live in `src/site/content/releases.ts`. To add one, put a new object at the top of `RELEASES`: `slug`, `version`, `title`, `date`, `summary` and `sections` of `new` / `improved` / `fixed` / `changed` notes. Its **`theme`** is any biome (`"tundra"` for a December release, say): opening `/news/<slug>` dresses the whole page in that biome, and pointing at its card on `/news` previews it. `themeOverrides` tweaks single colours (`{ "--t-accent": "#ff8844" }`).
- **The Lore** (`content/lore.ts`): one chapter per biome or tribe; scrolling turns the page into the chapter's biome.
- **About** (`content/about.ts`): the development story and timeline.

### Architecture

```
packages/shared   @explorer/shared: deterministic core used by client and server
  iso.ts            2:1 isometric projection and elevation-aware picking
  world/            seeded archipelago generation, island names, A* pathfinding
  sim/              catalogue, state, commands, 10 Hz tick, pirates, weather, lookouts and diving, characters and walking, snapshots and patches
  protocol.ts       WebSocket message types
packages/art      @explorer/art: the colour palette and the per-pixel terrain painter
  terrain/          smooth fields from the tile data, ray-marched land, cliffs and water
packages/server   @explorer/server: node:http + ws, world rooms, JSON persistence
packages/client   @explorer/client: PixiJS v8 renderer, input, DOM HUD, map screen, synthesised sound, sessions
  index.html        the landing page (src/landing/): the game's own sprites, tribes and biomes, no PixiJS
  play/index.html   the game, served for every page under /play (routes in shared/src/routes.ts)
tools/sprites     palette extraction and the sprite generator → client/public/assets
```

- **Server-authoritative co-op.** Each world is a room that runs `tick()` 10 times a second. It validates every command with `applyCommand()` and broadcasts a patch with only what changed.
  - Every command is applied on behalf of the player who sent it (`applyCommand(state, cmd, actor)`). Commands about a player's own character, such as `move-character`, act on the actor's character and nobody else's; the rest are shared by the whole team.
  - Clients receive the world _seed_ plus a snapshot of the parts that change. They regenerate the terrain themselves.
  - Clients mirror state with `applyPatch()` and smooth movement between ticks.
- **Offline mode** uses the same `tick()` and `applyCommand()` in the browser (`LocalSession`), so single-player and co-op behave identically.
- **Persistence:** each world is saved to `data/worlds/<id>.json` every 30 s, when the last player leaves and on shutdown. Saves are atomic.
  - Players are identified by name plus a random token kept in `localStorage`. Only a hash of the token is stored on the server.
- **Rendering:**
  - Terrain is painted per pixel by `@explorer/art` in a Web Worker, one 16×16-tile chunk at a time, and baked into render-texture chunks together with the decoration. Painted ground is cached, so building something only redraws the decoration. The foam and shallows are painted as three wave frames that play under the ground, so shores lap and shimmer.
  - Buildings, trees, villagers and ships are depth-sorted by `x + y`. Plants and rocks get a small fixed offset inside their tile so they do not stand in rows. Terrain is drawn under every sprite, so anything standing on low ground behind a cliff or hill fades to a ghost instead of overlapping it.
  - Paths, farm fields and the trampled earth round buildings are painted into the ground from per-tile masks, so they blend into the land instead of ending at a sprite's edge.
  - Day and night colour the whole world. The time of day comes from the simulation clock (`GameState.time`), so everyone in a world sees the same sun. A colour grade is multiplied into the biome's grade, and the glow of lit windows and forges is drawn above it so darkness cannot dim it.
  - Fog of war is a smooth mask projected onto the isometric grid.
  - The world is drawn at one fixed zoom (3.5×), on whole-pixel positions.
