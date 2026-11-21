/** Fill map NPC names absent from the client's Korean locale with reviewed authored names. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const source = await read("public/data/locales/wow-forever/source.json");
const koreanGame = await read("public/data/locales/wow-forever/koKR.json");
const authored = await read("data/npc-name-localization/authored-korean-map-fallbacks.json");
const path = join(root, "src/i18n/locales/ko.json");
const raw = await readFile(path, "utf8");
const korean = JSON.parse(raw);
const names = new Set(Object.keys(authored));
const found = new Map([...names].map((name) => [name, 0]));
for (const [name, translated] of Object.entries(authored)) {
  if (!/[가-힣]/u.test(translated) || /[A-Za-z]/u.test(translated)) {
    throw new Error(`${name}: invalid authored Korean NPC name`);
  }
  const official = [...new Set(source.values.flatMap((value, index) =>
    value === name && koreanGame.values[index] && koreanGame.values[index] !== name
      ? [koreanGame.values[index]] : []))];
  if (official.length) throw new Error(`${name}: use the client Korean name instead`);
}
let added = 0;
function apply(sourceNode, targetNode, pathParts = []) {
  for (const [key, value] of Object.entries(sourceNode)) {
    const nextPath = [...pathParts, key];
    if (typeof value === "string") {
      if (!names.has(value)) continue;
      const pathText = nextPath.join(".");
      if (!/^map\.(?:questMarkers|mapgenieCommunity|classTrainers|professionTrainers|repairVendors|questNpcs)\./.test(pathText)) {
        throw new Error(`${value}: unexpected map context ${pathText}`);
      }
      found.set(value, found.get(value) + 1);
      const translated = authored[value];
      if (targetNode[key] && targetNode[key] !== translated) continue;
      if (!targetNode[key]) { targetNode[key] = translated; added += 1; }
    } else if (value && typeof value === "object") {
      targetNode[key] ??= Array.isArray(value) ? [] : {};
      apply(value, targetNode[key], nextPath);
    }
  }
}
apply(english, korean);
for (const [name, count] of found) if (!count) throw new Error(`${name}: no matching map field`);
const output = JSON.stringify(korean, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (output !== raw) throw new Error("Korean map NPC fallbacks are stale");
} else if (output !== raw) await writeFile(path, output);
console.log(`${added} authored Korean map NPC fields added`);
