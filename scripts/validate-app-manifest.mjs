import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { GAME_CONFIG } from "../src/game-config.ts";

const root = path.resolve(import.meta.dirname, "..");
const manifestPath = path.resolve(root, process.argv[2] ?? "public/manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const metadata = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const schema = JSON.parse(fs.readFileSync(path.join(root, "schema/overwolf-manifest-schema.json"), "utf8"));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);
assert(validate(manifest), JSON.stringify(validate.errors, null, 2));
assert.equal(manifest.meta.name, GAME_CONFIG.appName);
assert.equal(manifest.meta.version, metadata.version);
assert.equal(manifest.meta.author, metadata.author);
assert.equal(manifest.data.url_protocol.scheme, GAME_CONFIG.protocolScheme);
const sortedIds = (ids) => [...ids].sort((a, b) => a - b);
assert.deepEqual(sortedIds(manifest.data.game_targeting?.game_ids ?? []), sortedIds(GAME_CONFIG.gameClassIds));
const launchIds = (manifest.data.launch_events ?? []).flatMap((event) => event.event_data?.game_ids ?? []);
assert.deepEqual(sortedIds(launchIds), sortedIds([...GAME_CONFIG.gameClassIds, ...GAME_CONFIG.launcherClassIds, ...GAME_CONFIG.diagnosticGameClassIds]));
assert.equal(manifest.data.game_targeting.type, GAME_CONFIG.gameClassIds.length ? "dedicated" : "none");
for (const name of ["background", "main"]) assert(manifest.data.windows[name], `Missing window: ${name}`);
const apps = JSON.parse(fs.readFileSync(path.join(root, "src/features/app-library/map-apps.json"), "utf8"));
assert.deepEqual(sortedIds([...new Set(apps.flatMap(app => app.gameIds))]), sortedIds(manifest.data.game_targeting.game_ids));
const requiredEvents = new Set();
for (const app of apps) {
  const original = JSON.parse(fs.readFileSync(path.join(root, "public/apps", app.id, "manifest.json"), "utf8"));
  for (const id of original.data.game_events ?? []) requiredEvents.add(id);
  for (const id of app.gameIds) assert(launchIds.includes(id), `Missing game auto-launch: ${app.id}/${id}`);
}
assert.deepEqual(sortedIds(manifest.data.game_events ?? []), sortedIds([...requiredEvents]));
for (const [name, window] of Object.entries(manifest.data.windows)) {
  if (window.focus_game_takeover_release_hotkey) assert(manifest.data.hotkeys[window.focus_game_takeover_release_hotkey], `Missing focus release hotkey: ${name}`);
}
for (const app of apps) for (const name of Object.values(app.windows)) {
  assert(manifest.data.windows[name], `Missing imported window: ${name}`);
}
for (const name of ["toggle_desktop_app", "toggle_app", "toggle_overlay"]) assert(manifest.data.hotkeys[name], `Missing hotkey: ${name}`);
const release = path.dirname(manifestPath);
const assets = [manifest.meta.icon, manifest.meta.icon_gray, manifest.meta.launcher_icon, manifest.meta.tray_icon, manifest.meta.window_icon,
  ...Object.values(manifest.data["extra-objects"] ?? {}).map((object) => object.file)];
for (const file of assets.filter(Boolean)) assert(fs.existsSync(path.join(release, file)), `Missing manifest asset: ${file}`);
if (release !== path.join(root, "public")) {
  for (const file of [...Object.values(manifest.data.windows).map((window) => window.file), manifest.data.uninstall_window?.file].filter(Boolean)) {
    assert(fs.existsSync(path.join(release, file)), `Missing window entry: ${file}`);
  }
}
console.log("Manifest validated: app identity, game targeting, windows, hotkeys and assets agree.");
