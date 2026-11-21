import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = async relative => JSON.parse(await fs.readFile(path.join(root, relative), "utf8"));
const manifest = await read("public/manifest.json");
const apps = await read("public/app-library.json");
const events = new Set();
for (const app of apps) {
  const original = await read(`public/apps/${app.id}/manifest.json`);
  for (const id of original.data.game_events || []) events.add(id);
  const html = await fs.readFile(path.join(root, "public/apps", app.id, app.entry), "utf8");
  const options = JSON.parse(html.match(/window\.__MAP_IT_APP__=(.*?);<\/script>/)[1]);
  for (const [name, window] of Object.entries(original.data.windows)) {
    const hotkey = window.focus_game_takeover_release_hotkey;
    if (hotkey && name !== "main" && name !== "background") {
      const mapped = options.hotkeys[hotkey];
      if (!manifest.data.hotkeys[mapped]) throw new Error(`Missing mapped hotkey: ${app.id}/${hotkey}`);
      manifest.data.windows[app.windows[name]].focus_game_takeover_release_hotkey = mapped;
    }
  }
}
manifest.data.game_events = [...events].sort((a, b) => a - b);
await fs.writeFile(path.join(root, "public/manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ games: manifest.data.game_targeting.game_ids.length, eventGames: manifest.data.game_events }));
