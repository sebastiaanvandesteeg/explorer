import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { GAME_NAME } from "@explorer/shared";

const PORT = Number(process.env.PORT ?? 8787);

const http = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end(`${GAME_NAME} server`);
});
const wss = new WebSocketServer({ server: http, path: "/ws" });
wss.on("connection", (socket) => {
  socket.on("message", (raw) => socket.send(raw.toString()));
});

http.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));
