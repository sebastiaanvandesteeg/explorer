# Explorer

A co-op, browser-based isometric pixel-art game about exploring a randomly generated archipelago and building a settlement together. Up to 8 players share one tribe, one stockpile and one map.

![Gameplay](docs/screenshot.png)

![Four of the ten biomes: the Infernal Isles, Frostreach, the Fungal Hollows and the Petal Isles](docs/biomes.webp)

The art style follows the concept art below. Everything is **generated in code** using a palette sampled from it: objects are baked into a sprite atlas, and the land itself (coasts, beaches, cliffs, foam and shallows) is painted per pixel while the game runs, so it never looks like a grid of tiles.

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

The site root is the landing page; the game itself lives at **/play** (http://localhost:5190/play). Pick a tribe, start an expedition, then use **Copy invite link** to bring up to 7 friends. Invite links look like `/play/w/<id>`.

- **Offline:** "Play offline" in the lobby (or `/play?offline&seed=anything&tribe=northfolk`) runs the whole simulation in your browser. Nothing is saved.
- **Production:** `pnpm build && pnpm start` builds the client, and the Node server then serves the landing page, the game and the API from one port (8787).
- **Old links:** invite links (`/w/<id>`) and offline URLs (`/?offline…`) from before the game moved to /play redirect there.

### Controls

| Action | How                                                                                                                                                                                                                                                                                                        |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walk   | WASD / arrow keys (free movement), or right-click the ground with nothing selected. The camera is bound to your character at a fixed zoom                                                                                                                                                                  |
| Build  | `1`–`9`, `0`, `B` (harbour), `L` (lighthouse), `P` (path) or the build menu, then click. Shift-click keeps placing. Paths can be dragged                                                                                                                                                                   |
| Select | Click a villager, ship, building or resource                                                                                                                                                                                                                                                               |
| Order  | With a villager selected, right-click a resource, building, ship, bones or the ground. With a ship selected, right-click the sea, an island, a harbour (cargo ships), a shipwreck or a sunken site. With nothing selected, right-click a ship (or press `F` near one) to climb aboard; `F` again steps off |
| Cancel | `Esc` or right-click                                                                                                                                                                                                                                                                                       |
| Chat   | `Enter`                                                                                                                                                                                                                                                                                                    |
| Map    | `M` opens the chart of the archipelago (or use the Map button by the minimap). `M` or `Esc` closes it                                                                                                                                                                                                      |
| Sound  | `N` mutes or unmutes (or the Sound button in the expedition panel). Your choice is remembered                                                                                                                                                                                                              |
| Home   | `C` centres on the town hall (it brings the camera back to your character)                                                                                                                                                                                                                                 |
| Pack   | `I` opens your pack, `E` picks up what lies within reach, right-click an item to walk over and take it                                                                                                                                                                                                     |

## Documentation

- [Gameplay](docs/gameplay.md): characters, tribes, the world, biomes, pirates, day and night, how a settlement grows
- [Architecture](docs/architecture.md): the website and how the packages fit together
- [Pixel art pipeline](docs/art-pipeline.md): how the sprites and terrain are generated
- [Roadmap](docs/roadmap.md): what is planned and why

## Scripts

| Script                      | What it does                                                                    |
| --------------------------- | ------------------------------------------------------------------------------- |
| `pnpm dev`                  | Server (watch) and Vite client                                                  |
| `pnpm build` / `pnpm start` | Build the client / run the server, which serves the built client                |
| `pnpm test`                 | Sprite freshness check plus shared, server and client tests                     |
| `pnpm test:e2e`             | Playwright smoke test: landing page, new world, building, friend joins, offline |
| `pnpm check`                | Prettier, typecheck and tests (what CI runs, plus e2e)                          |
| `pnpm sprites`              | Regenerate the sprite atlas                                                     |

Server environment variables: `PORT` (8787), `HOST`, `DATA_DIR` (`data/worlds`), `CLIENT_DIR` (`packages/client/dist`).
