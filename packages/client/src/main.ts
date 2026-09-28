import { Application, Text } from "pixi.js";
import { GAME_NAME } from "@explorer/shared";

const app = new Application();
await app.init({ background: "#1d6f7a", resizeTo: window });
document.getElementById("app")!.appendChild(app.canvas);
app.stage.addChild(new Text({ text: GAME_NAME, style: { fill: "#fff" } }));
