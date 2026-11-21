import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = async file => JSON.parse(await fs.readFile(file, "utf8"));
const apps = await read(path.join(root, "src/features/app-library/map-apps.json"));
const manifest = await read(path.join(root, "public/manifest.json"));
const configured = await read(path.join(root, "config/map-apps.json"));
assert.deepEqual(apps.map(app => app.id), configured.map(app => app.id));
assert.equal(new Set(apps.map(app => app.id)).size, apps.length);
const shortcuts = Object.values(manifest.data.hotkeys).map(hotkey => hotkey.default).filter(Boolean);
assert.equal(new Set(shortcuts).size, shortcuts.length, "Native shortcuts must not conflict across imported apps");
let sources = 0;
const sourceDrift = [];
for (const app of apps) {
  const record = await read(path.join(root, "projects", app.id, "snapshot.json"));
  for (const [relative, expected] of Object.entries(record.sourceSha256)) {
    const snapshot = createHash("sha256").update(await fs.readFile(path.join(root, "projects", app.id, relative))).digest("hex");
    assert.equal(snapshot, expected, `Source snapshot changed: ${app.id}/${relative}`);
    if (process.argv.includes("--check-sources")) {
      const current = await fs.readFile(path.join(record.source, relative)).then(bytes => createHash("sha256").update(bytes).digest("hex")).catch(() => null);
      if (current !== expected) sourceDrift.push(`${app.id}/${relative}`);
    }
    sources++;
  }
  for (const [surface, nativeName] of Object.entries(app.windows)) {
    const definition = manifest.data.windows[nativeName];
    assert(definition, `Missing window ${nativeName}`);
    const html = await fs.readFile(path.join(root, "public/apps", app.id, app.windowFiles[surface]), "utf8");
    assert(html.includes('/map-it-runtime.js'), `Missing isolation adapter: ${app.id}/${surface}`);
    if (!["background", "main"].includes(surface)) await fs.access(path.join(root, "public", definition.file));
  }
  const html = await fs.readFile(path.join(root, "public/apps", app.id, app.entry), "utf8");
  const options = JSON.parse(html.match(/window\.__MAP_IT_APP__=(.*?);<\/script>/s)[1]);
  for (const mapped of Object.values(options.hotkeys)) assert(manifest.data.hotkeys[mapped], `Undeclared hotkey: ${mapped}`);
  assert.equal(options.id, app.id);
  assert(!Object.keys(record.sourceSha256).some(file => /(?:^|\/)\.env(?:$|\.(?!example$))/.test(file)), "Private env files must not be imported");
}
for (const plugin of Object.values(manifest.data["extra-objects"])) await fs.access(path.join(root, "public", plugin.file));
for (const relative of ["bin/java.exe", "bin/attach.dll", "bin/server/jvm.dll"]) await fs.access(path.join(root, "public/apps/project-zomboid/native-position/runtime", relative));
console.log(JSON.stringify({ status: "passed", apps: apps.length, sourceSnapshotFilesVerified: sources, sourceChangesSinceImport: sourceDrift, uniqueShortcuts: shortcuts.length, nativeWindows: Object.keys(manifest.data.windows).length }));
