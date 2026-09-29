import { resolve } from "node:path";
import { startApp } from "./app";

const root = resolve(import.meta.dirname, "../../..");
const app = await startApp({
  port: Number(process.env.PORT ?? 8787),
  ...(process.env.HOST ? { host: process.env.HOST } : {}),
  dataDir: process.env.DATA_DIR ?? resolve(root, "data/worlds"),
  clientDir: process.env.CLIENT_DIR ?? resolve(root, "packages/client/dist"),
});
console.log(`[server] Explorer listening on http://localhost:${app.port}`);

let closing = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    console.log("[server] saving worlds…");
    await app.close();
    process.exit(0);
  });
}
