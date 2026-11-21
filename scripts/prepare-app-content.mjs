import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { build, transform } from "esbuild";
import { parse } from "acorn";
import sharp from "sharp";
import { classifyContent, DATA_EXTENSIONS } from "../config/app-content-policy.mjs";

export const root = path.resolve(import.meta.dirname, "..");
export const cacheRoot = path.join(root, ".content-cache");
export const digest = data => createHash("sha256").update(data).digest("hex");
export const writeJson = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n"); };
export async function walk(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Content inputs must not contain links");
    if (entry.isDirectory()) files.push(...await walk(file));
    else files.push(file);
  }
  return files;
}
const mime = relative => ({ ".json": "application/json; charset=utf-8", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8" })[path.extname(relative)] || "application/octet-stream";

export async function prepare() {
  await fs.mkdir(cacheRoot, { recursive: true });
  const apps = JSON.parse(await fs.readFile(path.join(root, "public/app-library.json"), "utf8"));
  const plan = { version: 1, apps: {}, shared: {}, inputs: {}, prepared: {}, omitted: [], localeStubs: 0 };
  async function stage(body, extension = ".bin") {
    const sha256 = digest(body); const file = path.join(cacheRoot, "blobs", sha256 + extension);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
    return { file, sha256, size: body.length };
  }
  async function remote(app, relative, body) {
    const source = await stage(body, path.extname(relative));
    const zipped = [".json", ".svg", ".txt"].includes(path.extname(relative)) ? gzipSync(body, { level: 9 }) : body;
    const compress = [".json", ".svg", ".txt"].includes(path.extname(relative)) && zipped.length < body.length * 0.95;
    const stored = compress ? await stage(zipped, ".gzip") : source;
    plan.apps[app].files[relative] = { ...source, storedFile: stored.file, storedSha256: stored.sha256, storedSize: stored.size, md5: createHash("md5").update(compress ? zipped : body).digest("hex"), gzip: compress, mime: mime(relative) };
  }
  for (const app of apps) {
    const directory = path.join(root, "public/apps", app.id);
    const record = plan.apps[app.id] = { files: {}, redirects: {}, virtualLocales: null, stubs: {}, prefetch: [] };
    const fonts = [];
    const appFiles = await walk(directory);
    const fontFamily = file => file.replace(/-[A-Za-z0-9_-]{8}\.woff2?$/, "");
    for (const file of appFiles) {
      const relative = path.relative(directory, file).split(path.sep).join("/");
      const publicPath = `apps/${app.id}/${relative}`;
      const body = await fs.readFile(file); const stat = await fs.stat(file);
      plan.inputs[publicPath] = { sha256: digest(body), size: body.length, mtimeMs: stat.mtimeMs };
      if (relative.endsWith(".woff2")) {
        const font = await stage(body, ".woff2"); const destination = `shared/fonts/${font.sha256}.woff2`;
        plan.shared[destination] = font;
        record.redirects[relative] = "/" + destination;
        plan.omitted.push(publicPath); fonts.push(relative); continue;
      }
      if (relative.endsWith(".woff")) {
        const sibling = appFiles.find(candidate => candidate.endsWith(".woff2") && fontFamily(candidate) === fontFamily(file));
        if (sibling) { plan.omitted.push(publicPath); continue; }
      }
      const action = classifyContent(app.id, relative);
      if (action === "omit-build-input") { plan.omitted.push(publicPath); continue; }
      if (action === "remote" && DATA_EXTENSIONS.has(path.extname(relative))) {
        await remote(app.id, relative, body); plan.omitted.push(publicPath); continue;
      }
      if (action === "split-valheim-locale") {
        const payload = JSON.parse(body);
        const english = Buffer.from(JSON.stringify({ english: payload.english }));
        plan.prepared[publicPath] = await stage(english, ".json");
        const packs = {};
        for (const language of ["Russian", "Chinese", "Portuguese_Brazilian"]) {
          if (!payload.translations?.[language]) throw new Error(`Missing supported Valheim language: ${language}`);
          const target = `locale-data/${language}.json`;
          await remote(app.id, target, Buffer.from(JSON.stringify(payload.translations[language])));
          packs[language] = target;
        }
        record.virtualLocales = { path: relative, packs }; continue;
      }
      if (app.id === "elden-ring" && /^assets\/(?:(?:er-(?:items|map|markers)|nightreign)\.)?(?:de|es(?:-419)?|fr|it|ja|ko|pl|pt|ru|th|zh-Hans|zh-Hant)-[\w-]+\.js$/.test(relative)) {
        const text = body.toString("utf8");
        const ast = parse(text, { ecmaVersion: "latest", sourceType: "module" });
        if (ast.body.some(node => node.type === "ImportDeclaration" || node.type === "ExportAllDeclaration")) continue;
        const compiled = await transform(text, { format: "cjs", platform: "browser", target: "es2022" });
        const sandbox = { module: { exports: {} } };
        vm.runInNewContext(compiled.code, sandbox, { timeout: 5000 });
        const exported = sandbox.module.exports;
        if (!exported.default || typeof exported.default !== "object") continue;
        const named = Object.keys(exported).filter(key => key !== "default" && key !== "__esModule");
        for (const key of named) if (JSON.stringify(exported[key]) !== JSON.stringify(exported.default[key])) throw new Error(`Locale export is not plain JSON: ${relative}/${key}`);
        const target = `locale-data/${path.basename(relative, ".js")}.json`;
        await remote(app.id, target, Buffer.from(JSON.stringify(exported.default)));
        const bindings = named.map((key, index) => `const v${index}=data[${JSON.stringify(key)}];`).join("");
        const exports = ["data as default", ...named.map((key, index) => `v${index} as ${JSON.stringify(key)}`)].join(",");
        const stub = `const data=await window.__MAP_IT_CONTENT__.loadJson(${JSON.stringify(target)});${bindings}export{${exports}};\n`;
        await transform(stub, { format: "esm", target: "es2022" });
        plan.prepared[publicPath] = await stage(Buffer.from(stub), ".js"); record.stubs[relative] = target; plan.localeStubs++;
      }
    }
    // Six texture candidates passed an exact RGBA round-trip; the other two
    // stay PNG if their data channels change, including transparent pixels.
    if (app.id === "valheim") for (const name of ["background", "clouds", "fog-layer", "forest", "lava-mask", "mountain", "space", "water"]) {
      const relative = `game-data/map-textures/${name}.png`; const file = path.join(directory, relative);
      const body = await fs.readFile(file);
      const before = await sharp(body).ensureAlpha().raw().toBuffer();
      const webp = await sharp(body).webp({ lossless: true, effort: 6 }).toBuffer();
      const after = await sharp(webp).ensureAlpha().raw().toBuffer();
      if (!before.equals(after) || webp.length >= body.length) continue;
      const target = `apps/${app.id}/game-data/map-textures/${name}.lossless.webp`;
      plan.prepared[target] = await stage(webp, ".webp");
      record.redirects[relative] = "/" + target; plan.omitted.push(`apps/${app.id}/${relative}`);
    }
    const sorted = Object.entries(record.files).sort(([a], [b]) => a.localeCompare(b));
    record.fingerprint = digest(Buffer.from(sorted.map(([name, file]) => `${name}\0${file.sha256}\0${file.size}\n`).join(""))).slice(0, 24);
    if (app.id === "baldurs-gate-3") record.prefetch = ["maps/index.json", "data/item-database.json"];
    if (app.id === "minecraft") record.prefetch = Object.keys(record.files).filter(name => /knowledge-data\/.*\/items\.json$/.test(name)).slice(0, 2);
    console.log(JSON.stringify({ app: app.id, remoteFiles: sorted.length, remoteBytes: sorted.reduce((sum, [, f]) => sum + f.storedSize, 0), fontFilesShared: fonts.length, localeStubs: Object.keys(record.stubs).length }));
  }
  await build({ entryPoints: [path.join(root, "scripts/runtime/app-content-runtime.ts")], outfile: path.join(cacheRoot, "content-runtime.js"), bundle: true, minify: true, platform: "browser", format: "iife", target: "chrome100", conditions: ["browser"] });
  plan.prepared["map-it-content.js"] = await stage(await fs.readFile(path.join(cacheRoot, "content-runtime.js")), ".js");
  const planFile = path.join(cacheRoot, "plan.json"); await writeJson(planFile, plan);
  await writeJson(path.join(cacheRoot, "enabled.json"), { version: 1, planSha256: digest(await fs.readFile(planFile)) });
  return plan;
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.join(root, "scripts/prepare-app-content.mjs")) {
  await prepare();
}
