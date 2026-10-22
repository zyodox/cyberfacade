import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const host = process.env.TAURI_DEV_HOST;

/**
 * Dev-only: accepts PNG snapshots POSTed by `window.__facade.snapshot()` and
 * writes them to ./.debug so rendered frames can be inspected at full size.
 */
function debugSnapshots(): Plugin {
  return {
    name: "facade-debug-snapshots",
    apply: "serve",
    // Preset JSON feeds several module graphs (browser, thumbnails, debug hooks):
    // reload the page so every consumer sees the edit.
    handleHotUpdate({ file, server }) {
      if (/presets[\\/]library[\\/].+\.json$/.test(file) || /debugHooks\.ts$/.test(file) || /\.wgsl$/.test(file)) {
        server.ws.send({ type: "full-reload" });
        return [];
      }
    },
    configureServer(server) {
      // Dev task channel: a test harness drops .debug/task.json, the running app
      // (browser or Tauri) picks it up once and posts the outcome to /__debug/result.
      server.middlewares.use("/__debug/task", (req, res) => {
        const file = resolve(__dirname, ".debug", "task.json");
        if (!existsSync(file)) return void res.writeHead(204).end();
        const body = readFileSync(file);
        // Tasks may target one runtime ("tauri" | "browser"); others leave it alone.
        const runtime = new URL(req.url ?? "", "http://x").searchParams.get("runtime");
        const wanted = (JSON.parse(body.toString()) as { runtime?: string }).runtime;
        if (wanted && wanted !== runtime) return void res.writeHead(204).end();
        rmSync(file);
        res.writeHead(200, { "content-type": "application/json" }).end(body);
      });
      server.middlewares.use("/__debug/result", (req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          mkdirSync(resolve(__dirname, ".debug"), { recursive: true });
          writeFileSync(resolve(__dirname, ".debug", "task-result.json"), Buffer.concat(chunks));
          res.writeHead(200).end("ok");
        });
      });
      server.middlewares.use("/__debug/log", (req, res) => {
        if (req.method !== "POST") return void res.writeHead(405).end();
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          const dir = resolve(__dirname, ".debug");
          mkdirSync(dir, { recursive: true });
          writeFileSync(resolve(dir, "boot-report.json"), Buffer.concat(chunks));
          res.writeHead(200).end("ok");
        });
      });
      // Arbitrary exported files (3D model export tests from the browser runtime) → .debug/export/.
      server.middlewares.use("/__debug/file", (req, res) => {
        if (req.method !== "POST") return void res.writeHead(405).end();
        const url = new URL(req.url ?? "", "http://x");
        const name = (url.searchParams.get("name") ?? "file.bin").replace(/[^\w.-]/g, "_");
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          const dir = resolve(__dirname, ".debug", "export");
          mkdirSync(dir, { recursive: true });
          const file = resolve(dir, name);
          writeFileSync(file, Buffer.concat(chunks));
          res.writeHead(200, { "content-type": "text/plain" }).end(file);
        });
      });
      server.middlewares.use("/__debug/snapshot", (req, res) => {
        if (req.method !== "POST") return void res.writeHead(405).end();
        const url = new URL(req.url ?? "", "http://x");
        const name = (url.searchParams.get("name") ?? "snapshot").replace(/[^\w.-]/g, "_");
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          const dir = resolve(__dirname, ".debug");
          mkdirSync(dir, { recursive: true });
          const file = resolve(dir, `${name}.png`);
          writeFileSync(file, Buffer.concat(chunks));
          res.writeHead(200, { "content-type": "text/plain" }).end(file);
        });
      });
    },
  };
}

// Tauri expects a fixed port and must not have the terminal cleared under it.
export default defineConfig({
  plugins: [react(), debugSnapshots()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**", "**/.debug/**"] },
  },
  build: {
    target: "es2022",
    sourcemap: false,
  },
});
