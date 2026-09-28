import "./styles.css";
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

async function startOffline(name: string, seed: string): Promise<void> {
  history.replaceState(null, "", `/?offline&seed=${encodeURIComponent(seed)}`);
  const done = loading("Generating islands…");
  const assets = await atlas();
  const session = new LocalSession(seed, name);
  done();
  await Game.create(root, session, assets);
}

function lobby(opts: { joinId?: string; error?: string } = {}): void {
  const close = showLobby(ui, {
    ...opts,
    onEnter: (name, id) => {
      close();
      void startOnline(id, name);
    },
    onOffline: (name, seed) => {
      close();
      void startOffline(name, seed);
    },
  });
}

const params = new URLSearchParams(location.search);
const join = location.pathname.match(/^\/w\/([a-z0-9]{4,32})\/?$/i);
void atlas();
if (params.has("offline")) {
  void startOffline(playerName() || "Explorer", params.get("seed") || "offline");
} else if (join && playerName()) {
  void startOnline(join[1]!.toLowerCase(), playerName());
} else if (join) {
  lobby({ joinId: join[1]!.toLowerCase() });
} else {
  lobby();
}
