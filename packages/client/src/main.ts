import "./styles.css";
import { isTribe, type TribeId } from "@explorer/shared";
import { loadAtlas, type Atlas } from "./assets";
import { Game } from "./game/game";
import { playerName, playerToken } from "./net/identity";
import { NetSession } from "./net/netSession";
import { LocalSession } from "./net/session";
import { h } from "./ui/dom";
import { showLobby } from "./ui/lobby";

const root = document.getElementById("app")!;
const ui = document.body;
let atlasPromise: Promise<Atlas> | null = null;
const atlas = () => (atlasPromise ??= loadAtlas());

function loading(text: string): () => void {
  const el = h("div.lobby", {}, h("div.lobby-card.panel", {}, h("p", {}, text)));
  ui.append(el);
  return () => el.remove();
}

async function startOnline(worldId: string, name: string): Promise<void> {
  history.replaceState(null, "", `/w/${worldId}`);
  const done = loading("Setting sail…");
  try {
    const [assets, session] = await Promise.all([
      atlas(),
      NetSession.connect(worldId, name, playerToken()),
    ]);
    done();
    await Game.create(root, session, assets);
  } catch (e) {
    done();
    lobby({
      ...(location.pathname.startsWith("/w/") ? { joinId: worldId } : {}),
      error: (e as Error).message,
    });
  }
}

async function startOffline(name: string, seed: string, tribe: TribeId): Promise<void> {
  const reveal = params.has("reveal") ? "&reveal" : "";
  history.replaceState(
    null,
    "",
    `/?offline&seed=${encodeURIComponent(seed)}&tribe=${tribe}${reveal}`,
  );
  const done = loading("Generating islands…");
  const assets = await atlas();
  const session = new LocalSession(seed, name, tribe);
  // Dev aid for reviewing art: `&reveal` lifts the fog in offline games.
  if (params.has("reveal")) session.state.explored.fill(1);
  done();
  await Game.create(root, session, assets);
}

function lobby(opts: { joinId?: string; error?: string } = {}): void {
  const close = showLobby(ui, {
    ...opts,
    atlas: atlas(),
    onEnter: (name, id) => {
      close();
      void startOnline(id, name);
    },
    onOffline: (name, seed, tribe) => {
      close();
      void startOffline(name, seed, tribe);
    },
  });
}

const params = new URLSearchParams(location.search);
const join = location.pathname.match(/^\/w\/([a-z0-9]{4,32})\/?$/i);
void atlas();
if (params.has("offline")) {
  const tribe = params.get("tribe");
  void startOffline(
    playerName() || "Explorer",
    params.get("seed") || "offline",
    isTribe(tribe) ? tribe : "islanders",
  );
} else if (join && playerName()) {
  void startOnline(join[1]!.toLowerCase(), playerName());
} else if (join) {
  lobby({ joinId: join[1]!.toLowerCase() });
} else {
  lobby();
}
