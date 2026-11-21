import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

/** Local development uses the same reader as the Overwolf plug-in. No mock positions. */
export const positionDevServer = (): Plugin => ({
  name: "phantom-blade-local-position",
  apply: "serve",
  configureServer(server) {
    let child: ChildProcessWithoutNullStreams | undefined;
    let snapshot = '{"state":"connecting"}';
    let lastLineAt = 0;
    let pending = "";
    const manifestPath = resolve(server.config.root, "public/manifest.json");
    const profilesPath = resolve(server.config.root, "native/position-reader/profiles-v1.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const hash = /phantom-blade-position-reader-([a-f0-9]+)\.dll$/.exec(manifest.data["extra-objects"]?.["phantom-blade-position-reader"]?.file ?? "")?.[1];
    const executable = resolve(server.config.root, `artifacts/live-tracker-research-2026-10-29/position-reader-${hash}.exe`);
    const stop = () => { child?.kill(); child = undefined; };
    const manifestChanged = (path: string) => {
      const changed = resolve(path);
      if (changed === profilesPath) stop();
      if (changed === manifestPath) { stop(); void server.restart(); }
    };
    server.watcher.on("change", manifestChanged);
    const close = () => { stop(); server.watcher.off("change", manifestChanged); };
    server.httpServer?.once("close", close);
    server.watcher.once("close", close);
    server.middlewares.use("/__pbz/position", (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json");
      const host = req.headers.host?.split(":")[0];
      const address = req.socket.remoteAddress;
      if (req.method !== "GET" || !["127.0.0.1", "localhost", "["].includes(host ?? "")
        || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address ?? "")
        || (req.headers["sec-fetch-site"] && !["same-origin", "none"].includes(String(req.headers["sec-fetch-site"])))) {
        res.statusCode = 403; res.end('{"state":"unavailable"}'); return;
      }
      if (!child && existsSync(executable)) {
        snapshot = '{"state":"connecting"}'; pending = "";
        const process = spawn(executable, ["0", "Infinity", profilesPath], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
        child = process;
        process.stdout.setEncoding("utf8");
        process.stdout.on("data", (chunk: string) => {
          pending += chunk;
          const lines = pending.split(/\r?\n/); pending = lines.pop() ?? "";
          for (const line of lines) {
            try { const value = JSON.parse(line); if (typeof value.state === "string") { snapshot = line; lastLineAt = Date.now(); } }
            catch { /* A partial diagnostic is never a position. */ }
          }
        });
        const exited = () => { if (child === process) { child = undefined; snapshot = '{"state":"unavailable"}'; } };
        process.on("exit", exited); process.on("error", exited);
        process.stderr.resume();
      }
      res.end(lastLineAt && Date.now() - lastLineAt > 3000 ? '{"state":"unavailable"}' : snapshot);
    });
  },
});
