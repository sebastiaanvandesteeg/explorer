import { resolve } from "node:path";
import { defineConfig } from "vite";

const SERVER = process.env.EXPLORER_SERVER ?? "http://localhost:8787";

export default defineConfig({
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
        sprites: resolve(import.meta.dirname, "sprites.html"),
      },
    },
  },
});
