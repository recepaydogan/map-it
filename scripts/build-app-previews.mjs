import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const configs = JSON.parse(await readFile(path.join(root, "config/map-apps.json"), "utf8"));
const registry = JSON.parse(await readFile(path.join(root, "public/app-library.json"), "utf8"));
const requested = process.argv.slice(2);
const apps = requested.length ? requested.map(id => {
  const app = configs.find(entry => entry.id === id);
  if (!app) throw new Error(`Unknown game: ${id}`);
  return app;
}) : configs;

const build = async ({ id, folder }) => {
  const source = path.join(root, "..", folder);
  const output = "node_modules/.cache/map-it-sidebar-preview";
  const mode = ["elden-ring", "peak"].includes(id) ? "overwolf" : "development";
  const buildSource = 'import { build } from "vite"; await build({ mode: process.argv[1], build: { outDir: process.argv[2], copyPublicDir: false, emptyOutDir: true } });';
  const args = ["--input-type=module", "--eval", buildSource, mode, output];
  const log = [];
  const proc = spawn(process.execPath, args, { cwd: source });
  proc.stdout.on("data", data => log.push(data));
  proc.stderr.on("data", data => log.push(data));
  const status = await new Promise((resolve, reject) => {
    proc.once("error", reject);
    proc.once("close", resolve);
  });
  if (status) throw new Error(`${id} build failed:\n${Buffer.concat(log)}`);

  const originalEntry = registry.find(app => app.id === id).entry;
  const imported = await readFile(path.join(root, "public/apps", id, originalEntry), "utf8");
  const bootstrap = imported.match(/<script>window\.__MAP_IT_APP__=(.*?);<\/script>/)?.[1];
  if (!bootstrap) throw new Error(`${id}: installed import has no bootstrap`);
  const runtime = JSON.parse(bootstrap);
  const built = path.join(source, output);
  const roots = new Set([...runtime.roots, ...await readdir(built)]);
  runtime.roots = [...roots];
  const escaped = [...roots].map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const scoped = new RegExp("([\"'`(=])/(" + escaped.join("|") + ")(?=[/\"'`?#)\\s])", "g");
  const previews = path.join(root, ".dev-cache/apps-preview", id);
  const paths = await readdir(built, { recursive: true, withFileTypes: true });
  const files = paths.filter(file => file.isFile());
  if (!files.some(file => file.parentPath === built && file.name === originalEntry)) {
    throw new Error(`${id}: build did not produce ${originalEntry}`);
  }
  const write = async file => {
    const name = path.relative(built, path.join(file.parentPath, file.name));
    const target = path.join(previews, name);
    let body = await readFile(path.join(built, name));
    if (/\.(?:html|js|css|json|svg)$/.test(name)) {
      let text = body.toString("utf8").replace(scoped, (_, before, asset) => before + runtime.prefix + "/" + asset);
      if (name.endsWith(".html")) {
        const init = JSON.stringify(runtime).replaceAll("<", "\\u003c");
        text = text.replace("<head>", `<head><script>window.__MAP_IT_APP__=${init};</script><script src="/map-it-runtime.js"></script>`);
      }
      body = Buffer.from(text);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  };
  await Promise.all(files.filter(file => !file.name.endsWith(".html")).map(write));
  await Promise.all(files.filter(file => file.name.endsWith(".html")).map(write));
  console.log(`[preview] ${id}: ${files.length} files ready`);
};

let next = 0;
await Promise.all(Array.from({ length: Math.min(apps.length, 3) }, async () => {
  while (next < apps.length) {
    const app = apps[next++];
    try {
      await build(app);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}));
