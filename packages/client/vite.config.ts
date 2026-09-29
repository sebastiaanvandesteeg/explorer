import { resolve } from "node:path";
import { defineConfig, type Connect, type Plugin } from "vite";
// By path: Node loads this config, and the package index pulls in all of the shared TypeScript.
import { isGamePath, movedPath } from "../shared/src/routes.ts";

const SERVER = process.env.EXPLORER_SERVER ?? "http://localhost:8787";

/** Routes pages like the production server: the landing page at /, the game on every /play page. */
function siteRoutes(): Plugin {
  const route: Connect.NextHandleFunction = (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const moved = movedPath(url.pathname, url.search);
    if (moved) {
      res.writeHead(301, { location: moved });
      return res.end();
    }
    if (isGamePath(url.pathname)) req.url = `/play/index.html${url.search}`;
    next();
  };
  return {
    name: "explorer-site-routes",
    configureServer: (server) => void server.middlewares.use(route),
    configurePreviewServer: (server) => void server.middlewares.use(route),
  };
}

export default defineConfig({
  plugins: [siteRoutes()],
  server: {
    port: 5190,
    proxy: {
      "/api": SERVER,
      "/ws": { target: SERVER.replace(/^http/, "ws"), ws: true },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        play: resolve(import.meta.dirname, "play/index.html"),
        sprites: resolve(import.meta.dirname, "sprites.html"),
      },
    },
  },
});
