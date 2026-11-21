import fs from "node:fs/promises";
import path from "node:path";
import { loadContentBuild } from "./app-content-build.mjs";
import { walk, root } from "./prepare-app-content.mjs";
import { classifyContent, DATA_EXTENSIONS } from "../config/app-content-policy.mjs";

const output = path.resolve(root, process.argv[2] || ".dev-build");
if (path.dirname(output) !== root) throw new Error("Build verification must stay inside Map It.");
const content = await loadContentBuild();
if (!content) throw new Error("An optimized content plan is required.");
const limits = JSON.parse(await fs.readFile(path.join(root, "config/build-size-limits.json"), "utf8"));
const apps = JSON.parse(await fs.readFile(path.join(output, "app-library.json"), "utf8"));
const manifest = JSON.parse(await fs.readFile(path.join(output, "manifest.json"), "utf8"));
const sizes = {}; let total = 0;
for (const file of await walk(output)) {
  const relative = path.relative(output, file).split(path.sep).join("/");
  if (relative.split("/").some(part => part.startsWith(".env") || ["node_modules", "projects", ".git"].includes(part))) throw new Error(`Private/build input in output: ${relative}`);
  if (content.omitted.has(relative)) throw new Error(`Offloaded/duplicate content entered the build: ${relative}`);
  const size = (await fs.stat(file)).size; total += size;
  if (relative.startsWith("apps/")) {
    const [, app, ...parts] = relative.split("/");
    sizes[app] = (sizes[app] || 0) + size;
    if (classifyContent(app, parts.join("/")) === "remote" && DATA_EXTENSIONS.has(path.extname(file))) throw new Error(`CDN data entered the build: ${relative}`);
  }
}
for (const app of apps) {
  for (const file of Object.values(app.windowFiles)) {
    const html = await fs.readFile(path.join(output, "apps", app.id, file), "utf8");
    for (const adapter of ["map-it-runtime.js", "map-it-account.js", "map-it-content.js", "map-it-hotkeys.js"]) {
      if (!html.includes(`/${adapter}`)) throw new Error(`Missing ${adapter}: ${app.id}/${file}`);
    }
    const embedded = JSON.parse(html.match(/window\.__MAP_IT_APP__=(.*?);<\/script>/s)[1]);
    for (const [name, slot] of Object.entries(embedded.hotkeys || {})) {
      const binding = manifest.data.hotkeys[slot]?.default;
      if (binding && embedded.manifest.data.hotkeys?.[name]?.default !== binding) {
        throw new Error("Incorrect hotkey default: " + app.id + "/" + file + "/" + name);
      }
    }
    for (const match of html.matchAll(/(?:src|href)=["'](\/[^"']+\.(?:js|css))(?:[?#][^"']*)?["']/g)) await fs.access(path.join(output, match[1]));
  }
  if (!limits.apps[app.id] || sizes[app.id] > limits.apps[app.id]) throw new Error(`${app.id}: bundled size ${sizes[app.id]} exceeds reviewed limit ${limits.apps[app.id]}. Review new content before changing the limit.`);
}
for (const plugin of Object.values(manifest.data["extra-objects"] || {})) await fs.access(path.join(output, plugin.file));
if (total > limits.totalBytes) throw new Error(`Build size ${total} exceeds reviewed limit ${limits.totalBytes}.`);
const report = { totalBytes: total, appBytes: sizes, planSha256: content.release.planSha256, versions: Object.fromEntries(apps.map(app => [app.id, app.version])) };
await fs.writeFile(path.join(output, "map-it-build-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ status: "passed", ...report }));
